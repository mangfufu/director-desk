const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { relativeFile, skillPackage } = require('./package.cjs');

function createSkillStore({ directory, builtin, getBuiltin }) {
    const root = path.join(directory, 'skills'), index = path.join(root, 'index.json');
    let state = { version: 1, builtinEnabled: true, entries: [] }, changes = Promise.resolve();
    const ready = fs.readFile(index, 'utf8').then(text => {
        const parsed = JSON.parse(text);
        if (parsed.version !== 1 || typeof parsed.builtinEnabled !== 'boolean' || !Array.isArray(parsed.entries)
            || parsed.entries.some(e => !e || !validId(e.id) || !validId(e.folder) || typeof e.name !== 'string' || typeof e.enabled !== 'boolean')
            || new Set(parsed.entries.map(e => e.id)).size !== parsed.entries.length) throw Error('技能目录损坏');
        state = parsed;
    }).catch(error => { if (error.code !== 'ENOENT') throw Error('无法读取本机技能目录，原文件已保留'); });
    const validId = id => typeof id === 'string' && /^[0-9a-f-]{36}$/.test(id);
    const currentBuiltin = async () => { if (getBuiltin) builtin = await getBuiltin(); return builtin; };
    const builtinEntry = () => ({ id: 'builtin', name: builtin.name, description: '导演台操作、空间规则与配套提示词', version: builtin.version, releaseVersion: builtin.releaseVersion, enabled: state.builtinEnabled, builtin: true, source: '官方技能', files: ['SKILL.md', ...Object.keys(builtin.references ?? {})] });
    const list = async (enabledOnly = false) => {
        await ready; await changes; await currentBuiltin();
        return [builtinEntry(), ...state.entries.map(({ folder: _folder, ...e }) => ({ ...e, builtin: false }))].filter(e => !enabledOnly || e.enabled);
    };
    async function persist(next) {
        await fs.mkdir(root, { recursive: true });
        await fs.writeFile(index + '.tmp', JSON.stringify(next), { mode: 0o600 }); await fs.rename(index + '.tmp', index); state = next;
    }
    function mutate(fn) { const task = changes.then(async () => { await ready; return fn(); }); changes = task.catch(() => {}); return task; }
    function entryFor(id) { const entry = state.entries.find(e => e.id === id); if (!entry) throw Error('技能不存在'); return entry; }
    async function install(pack, source = '本地导入', replaceId) {
        // Validate before touching the installed copy. Every revision has its own owned directory.
        const validated = skillPackage(pack.files), folder = randomUUID();
        return mutate(async () => {
            const previous = replaceId ? entryFor(replaceId) : null;
            const destination = path.join(root, folder);
            try {
                for (const file of validated.files) {
                    const target = path.join(destination, relativeFile(file.path));
                    await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, file.bytes);
                }
                const entry = { id: previous?.id || randomUUID(), folder, name: validated.name, description: validated.description,
                    version: validated.version, enabled: previous?.enabled ?? true, source, files: validated.files.map(f => f.path), entry: validated.entry };
                await persist({ ...state, entries: [...state.entries.filter(e => e.id !== entry.id), entry] });
            } catch (error) { await removeFolder(folder).catch(() => {}); throw error; }
            if (previous) await removeFolder(previous.folder).catch(() => {});
        });
    }
    async function removeFolder(folder) {
        if (!validId(folder)) throw Error('技能目录无效');
        const target = path.resolve(root, folder);
        if (path.dirname(target) !== path.resolve(root)) throw Error('技能目录越界');
        await fs.rm(target, { recursive: true, force: true });
    }
    function enable(id, enabled) {
        return mutate(async () => {
            if (typeof enabled !== 'boolean') throw Error('技能开关无效');
            if (id !== 'builtin') entryFor(id);
            await persist(id === 'builtin' ? { ...state, builtinEnabled: enabled } : { ...state, entries: state.entries.map(e => e.id === id ? { ...e, enabled } : e) });
        });
    }
    function remove(id) {
        return mutate(async () => {
            if (id === 'builtin') throw Error('内置技能可以停用，随软件保留');
            const entry = entryFor(id); await persist({ ...state, entries: state.entries.filter(e => e.id !== id) }); await removeFolder(entry.folder);
        });
    }
    async function read({ id = 'builtin', path: requested, knownVersion } = {}, allowDisabled = false) {
        await ready; await changes; await currentBuiltin();
        const entry = id === 'builtin' ? builtinEntry() : entryFor(id);
        if (!entry.enabled && !allowDisabled) throw Error('此技能已停用，请遵循用户当前启用的技能');
        const file = relativeFile(requested ?? entry.entry ?? 'SKILL.md');
        if (!entry.files.includes(file)) throw Error('技能中没有这个文件');
        const unchanged = knownVersion === entry.version && requested === undefined;
        const release = entry.releaseVersion ? { releaseVersion: entry.releaseVersion } : {};
        if (unchanged) return { id, name: entry.name, version: entry.version, ...release, enabled: entry.enabled, unchanged: true, files: entry.files };
        let text = file === 'SKILL.md' ? builtin.instructions : builtin.references?.[file];
        if (id !== 'builtin') {
            const folder = await fs.realpath(path.join(root, entry.folder));
            const target = await fs.realpath(path.join(folder, file));
            const relative = path.relative(folder, target);
            if (relative.startsWith('..') || path.isAbsolute(relative)) throw Error('技能附件不能指向包外文件');
            const bytes = await fs.readFile(target);
            try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { throw Error('该文件是二进制附件，请在技能目录中查看'); }
            if (text.includes('\0')) throw Error('该文件是二进制附件，请在技能目录中查看');
        }
        return { id, name: entry.name, version: entry.version, ...release, enabled: entry.enabled, unchanged: false, path: file, instructions: text, files: entry.files };
    }
    async function folder(id) { await ready; await changes; return path.join(root, entryFor(id).folder); }
    async function tool(args = {}) {
        if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).some(k => !['action', 'id', 'path', 'knownVersion'].includes(k))
            || Object.values(args).some(v => typeof v !== 'string') || args.action && !['list', 'read'].includes(args.action)) throw Error('技能查询参数无效');
        return args.action === 'list' ? { skills: await list(true) } : read(args);
    }
    return { ready, list, install, enable, remove, read, folder, tool, currentBuiltin };
}
module.exports = { createSkillStore };
