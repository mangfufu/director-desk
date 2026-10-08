const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

async function atomicWrite(filename, content) {
    const temporary = path.join(path.dirname(filename), '.' + path.basename(filename) + '.' + randomUUID() + '.tmp');
    try { await fs.writeFile(temporary, content, { flag: 'wx' }); await fs.rename(temporary, filename); }
    finally { await fs.rm(temporary, { force: true }); }
}
function createFileHost({ directory, defaults, chooseDirectory, chooseSave }) {
    const configFile = path.join(directory, 'file-locations.json');
    let locations = { ...defaults }, saving = false;
    const ready = (async () => {
        try {
            const stored = JSON.parse(await fs.readFile(configFile, 'utf8'));
            for (const key of ['projects', 'exports']) if (typeof stored[key] === 'string' && path.isAbsolute(stored[key])) locations[key] = stored[key];
        } catch (e) { if (e.code !== 'ENOENT') throw Error('文件位置设置无法读取，请检查本机配置文件'); }
        // A removable/offline directory must not prevent opening settings to choose another one.
        for (const value of Object.values(locations)) await fs.mkdir(value, { recursive: true }).catch(() => {});
    })();
    const read = () => ({ ...locations });
    return {
        ready, read,
        async set(patch) {
            await ready;
            if (!patch || typeof patch !== 'object' || Array.isArray(patch) || Object.keys(patch).some(k => !['projects', 'exports'].includes(k))) throw Error('目录设置无效');
            for (const value of Object.values(patch)) if (typeof value !== 'string' || !path.isAbsolute(value) || value.includes('\0')) throw Error('目录必须为绝对路径');
            for (const value of Object.values(patch)) await fs.mkdir(value, { recursive: true });
            const next = { ...locations, ...patch };
            await fs.mkdir(directory, { recursive: true });
            await atomicWrite(configFile, JSON.stringify(next, null, 2)); locations = next; return read();
        },
        async choose(kind) {
            await ready;
            if (!['projects', 'exports'].includes(kind)) throw Error('未知目录类型');
            const result = await chooseDirectory(kind, locations[kind]);
            if (!result) return read();
            if (!path.isAbsolute(result) || !(await fs.stat(result)).isDirectory()) throw Error('请选择有效目录');
            const next = { ...locations, [kind]: result };
            await fs.mkdir(directory, { recursive: true });
            await atomicWrite(configFile, JSON.stringify(next, null, 2)); locations = next; return read();
        },
        defaultPath(name) {
            const safeName = path.basename(String(name)).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
            return path.join(locations[/\.director$/i.test(safeName) ? 'projects' : 'exports'], safeName || '导出文件');
        },
        async saveExport({ name, bytes } = {}) {
            await ready;
            if (typeof name !== 'string' || name.length > 150 || !/\.(mp4|webm)$/i.test(name)
                || /[<>:"/\\|?*\x00-\x1f]/.test(name) || /^[. ]|[. ]$/.test(name)
                || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) throw Error('视频文件名无效');
            if (!(bytes instanceof ArrayBuffer) && !(bytes instanceof Uint8Array)) throw Error('视频数据无效');
            if (!bytes.byteLength || bytes.byteLength > 250000000) throw Error('视频大小无效或超过 250 MB，请使用直接保存方式');
            const content = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
            await fs.mkdir(locations.exports, { recursive: true });
            const extension = path.extname(name), stem = name.slice(0, -extension.length);
            for (let index = 1; ; index++) {
                const filename = index === 1 ? name : `${stem} (${index})${extension}`;
                const destination = path.join(locations.exports, filename);
                let file;
                try { file = await fs.open(destination, 'wx'); }
                catch (error) { if (error.code === 'EEXIST') continue; throw error; }
                try { await file.writeFile(content); await file.close(); return { saved: true, filename }; }
                catch (error) { await file.close().catch(() => {}); await fs.rm(destination, { force: true }).catch(() => {}); throw error; }
            }
        },
        async saveProject({ name, content, path: existingPath } = {}) {
            await ready;
            if (saving) throw Error('项目正在保存');
            if (typeof name !== 'string' || typeof content !== 'string') throw Error('项目保存参数无效');
            const data = JSON.parse(content);
            if (data?.format !== 'director-desk' || ![1,2,3].includes(data.version)) throw Error('项目文件格式无效');
            saving = true;
            try {
                if (!existingPath) {
                    try { await fs.mkdir(locations.projects, { recursive: true }); }
                    catch { throw Error('默认工程目录不可用，请在“文件位置”中重新选择目录'); }
                }
                const filename = existingPath || await chooseSave(this.defaultPath(name.replace(/\.director$/i, '') + '.director'));
                if (!filename) return { saved: false };
                if (!path.isAbsolute(filename) || path.extname(filename).toLowerCase() !== '.director') throw Error('请使用 .director 工程文件名');
                await atomicWrite(filename, content);
                return { saved: true, path: filename };
            } finally { saving = false; }
        },
    };
}
module.exports = { createFileHost };
