const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { readModelFiles } = require('./model-files.ts');
const allowed = new Set(['.director', '.staging', '.txt', '.mp4', '.webm', '.png', '.zip', '.json', '.csv', '.svg', '.xml']);
function safeName(value) {
    if (typeof value !== 'string' || !value || value.length > 180 || /[<>:"/\\|?*\x00-\x1f]/.test(value)
        || /^[. ]|[. ]$/.test(value) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value)) throw Error('文件名无效');
    return value;
}
function absolute(value) { if (typeof value !== 'string' || !path.isAbsolute(value) || /\x00/.test(value)) throw Error('请提供绝对文件路径'); return path.resolve(value); }
function createAutomationFiles({ ready, locations }) {
    const writes = new Map();
    let generation = 0;
    async function discard(id) {
        const item = writes.get(id); if (!item) return;
        writes.delete(id); await item.handle.close().catch(() => {}); await fs.rm(item.temporary, { force: true });
    }
    return {
        async call(action, data = {}) {
            const started = generation;
            await ready;
            if (started !== generation) throw Error('文件操作已取消');
            if (action === 'automation-read') {
                const filename = absolute(data.path), ext = path.extname(filename).toLowerCase();
                if (['project','staging'].includes(data.kind)) {
                    if (ext !== ({project:'.director',staging:'.staging'}[data.kind])) throw Error('文件扩展名与导入类型不符');
                    const info = await fs.stat(filename);
                    if (!info.isFile() || info.size > 512 * 1024 * 1024) throw Error('文件无效或过大');
                    return { name: path.basename(filename), content: await fs.readFile(filename, 'utf8') };
                }
                if (!['model', 'motion'].includes(data.kind) || !['.glb', '.gltf', '.fbx', ...(data.kind === 'model' ? ['.obj'] : [])].includes(ext)) throw Error('不支持的导入类型');
                if (data.dependencies !== undefined && (!Array.isArray(data.dependencies) || data.dependencies.some(n => typeof n !== 'string'))) throw Error('关联文件列表无效');
                return { name: path.basename(filename), package: await readModelFiles(filename, data.dependencies) };
            }
            if (action === 'automation-write-begin') {
                if (writes.size >= 8) throw Error('同时写入的文件过多');
                if (data.overwrite !== undefined && typeof data.overwrite !== 'boolean') throw Error('覆盖选项无效');
                if (data.path && data.directory) throw Error('文件路径与目录不能同时指定');
                let destination = data.path ? absolute(data.path) : path.join(data.directory ? absolute(data.directory) : locations()[data.kind === 'project' ? 'projects' : 'exports'], safeName(data.name));
                safeName(path.basename(destination));
                if (!allowed.has(path.extname(destination).toLowerCase())) throw Error('不支持的输出扩展名');
                const extensions = { project: ['.director'], staging: ['.staging'], prompt: ['.txt'], screenshot: ['.png'], bundle: ['.zip'], video: ['.mp4', '.webm'], 'depth-video': ['.mp4', '.webm'] };
                if (!extensions[data.kind]?.includes(path.extname(destination).toLowerCase())) throw Error('输出扩展名与导出类型不符');
                await fs.mkdir(path.dirname(destination), { recursive: true });
                if (!data.overwrite) {
                    const ext = path.extname(destination), stem = destination.slice(0, -ext.length); let index = 1;
                    while (await fs.stat(destination).then(() => true, e => { if (e.code === 'ENOENT') return false; throw e; })) destination = `${stem} (${++index})${ext}`;
                }
                const id = randomUUID(), temporary = path.join(path.dirname(destination), '.' + path.basename(destination) + '.' + id + '.tmp');
                const handle = await fs.open(temporary, 'wx');
                if (started !== generation) { await handle.close(); await fs.rm(temporary, { force: true }); throw Error('文件操作已取消'); }
                writes.set(id, { handle, temporary, destination, overwrite: data.overwrite === true, position: 0 });
                return { id, path: destination, filename: path.basename(destination) };
            }
            const item = writes.get(data.id);
            if (action === 'automation-write-abort') { await discard(data.id); return { canceled: true }; }
            if (!item) throw Error('文件写入任务不存在或已结束');
            if (action === 'automation-write-chunk') {
                const bytes = data.bytes instanceof ArrayBuffer ? new Uint8Array(data.bytes) : data.bytes;
                if (!(bytes instanceof Uint8Array) || bytes.byteLength > 8 * 1024 * 1024) throw Error('文件数据块无效或超过 8 MB');
                const position = data.position ?? item.position;
                if (!Number.isSafeInteger(position) || position < 0) throw Error('写入位置无效');
                let offset = 0;
                while (offset < bytes.length) { const result = await item.handle.write(bytes, offset, bytes.length - offset, position + offset); if (!result.bytesWritten) throw Error('文件未能继续写入'); offset += result.bytesWritten; }
                item.position = position + bytes.length; return { written: bytes.length };
            }
            if (action === 'automation-write-close') {
                try {
                    await item.handle.sync(); await item.handle.close();
                    if (item.overwrite) await fs.rename(item.temporary, item.destination);
                    else { await fs.link(item.temporary, item.destination); await fs.unlink(item.temporary); }
                    writes.delete(data.id);
                    return { saved: true, path: item.destination, filename: path.basename(item.destination) };
                } catch (error) { await discard(data.id); throw error; }
            }
            throw Error('未知自动文件操作');
        },
        async close() { generation++; await Promise.all([...writes.keys()].map(discard)); },
    };
}
module.exports = { createAutomationFiles };
