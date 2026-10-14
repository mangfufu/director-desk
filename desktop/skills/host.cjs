const { text } = require('../language.cjs');
const { dialog, shell } = require('electron');
const { localPackage } = require('./package.cjs');
const { githubPackage } = require('./github.cjs');
const path = require('node:path');

function createSkillHost({ store, window, isRunning }) {
    let importing = false;
    async function handle(data = {}) {
        const { action, id } = data;
        if (action === 'list') return { skills: await store.list() };
        if (action === 'read') return store.read({ id, path: data.path }, true);
        if (action === 'open') { const error = await shell.openPath(await store.folder(id)); if (error) throw Error('无法打开技能目录'); return { skills: await store.list() }; }
        if (isRunning()) throw Error('请先结束当前 AI 任务，再修改启用的技能');
        if (importing) throw Error('正在导入技能，请稍候');
        importing = true;
        try {
            if (action === 'enable') await store.enable(id, data.enabled);
            else if (action === 'remove') await store.remove(id);
            else if (action === 'import') {
                if (data.path !== undefined) {
                    if (typeof data.path !== 'string' || !path.isAbsolute(data.path)) throw Error('技能导入需要绝对路径');
                    await store.install(await localPackage(data.path), '本地导入', id);
                    return { skills: await store.list() };
                }
                const chosen = await dialog.showOpenDialog(window, { title: data.kind === 'folder' ? text(window, '选择包含 SKILL.md 的技能目录') : text(window, '选择技能说明'),
                    properties: [data.kind === 'folder' ? 'openDirectory' : 'openFile'], ...(data.kind === 'folder' ? {} : { filters: [{ name: '技能说明', extensions: ['md'] }] }) });
                if (!chosen.canceled && chosen.filePaths[0]) await store.install(await localPackage(chosen.filePaths[0]), '本地导入', id);
            } else if (action === 'github') {
                const downloaded = await githubPackage(data.url); await store.install(downloaded.package, downloaded.source, id);
            } else if (action === 'reload') {
                const entry = (await store.list()).find(e => e.id === id); if (!entry || entry.builtin) throw Error('请选择自定义技能');
                await store.install(await localPackage(await store.folder(id)), entry.source, id);
            } else throw Error('未知技能操作');
            return { skills: await store.list() };
        } finally { importing = false; }
    }
    return { handle, isBusy: () => importing };
}
module.exports = { createSkillHost };
