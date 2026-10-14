const { text } = require('./language.cjs');
const { app, ipcMain, dialog } = require('electron');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createFileHost } = require('./file-host.cjs');
const { installFilePermissions } = require('./file-permissions.cjs');
const { createAutomationFiles } = require('./automation-files.cjs');

function attachFiles(window) {
    const session = window.webContents.session;
    installFilePermissions(session, window.webContents);
    const trusted = event => event.sender === window.webContents && event.senderFrame?.url === 'director://app/';
    const host = createFileHost({ directory: app.getPath('userData'), defaults: {
        projects: path.join(app.getPath('documents'), 'DirectorDesk', 'Projects'),
        exports: path.join(app.getPath('documents'), 'DirectorDesk', 'Exports'),
    }, chooseDirectory: async (kind, defaultPath) => {
        const result = await dialog.showOpenDialog(window, { title: kind === 'projects' ? text(window, '默认工程目录') : text(window, '默认导出目录'), defaultPath, properties: ['openDirectory', 'createDirectory'] });
        return result.canceled ? null : result.filePaths[0];
    }, chooseSave: async defaultPath => {
        const result = await dialog.showSaveDialog(window, { title: text(window, '保存项目'), defaultPath, filters: [{ name: text(window, '导演台工程'), extensions: ['director'] }], properties: ['createDirectory', 'showOverwriteConfirmation'] });
        return result.canceled ? null : result.filePath;
    } });
    const automation = createAutomationFiles({ ready: host.ready, locations: () => host.read() });
    let closeRequest = '', allowClose = false;
    let closeBusy = false;
    const closingState = (event, state) => { if (trusted(event)) closeBusy = state?.busy === true; event.returnValue = null; };
    ipcMain.on('director-close-state', closingState);
    ipcMain.handle('director-files', async (event, input) => {
        if (!trusted(event)) return { ok: false, error: '拒绝未知页面' };
        try {
            await host.ready;
            if (typeof input?.action === 'string' && input.action.startsWith('automation-')) return { ok: true, data: await automation.call(input.action, input.data) };
            if (input?.action === 'locations') return { ok: true, data: host.read() };
            if (input?.action === 'set-locations') return { ok: true, data: await host.set(input.data) };
            if (input?.action === 'choose') return { ok: true, data: await host.choose(input.data) };
            if (input?.action === 'choose-export-directory') {
                const result = await dialog.showOpenDialog(window, { title: text(window, '保存位置'), defaultPath: typeof input.data === 'string' && path.isAbsolute(input.data) ? input.data : host.read().exports, properties: ['openDirectory', 'createDirectory'] });
                return { ok: true, data: { path: result.canceled ? undefined : result.filePaths[0] } };
            }
            if (input?.action === 'save-project') return { ok: true, data: await host.saveProject(input.data) };
            if (input?.action === 'save-export') return { ok: true, data: await host.saveExport(input.data) };
            throw Error('未知文件操作');
        } catch (e) { return { ok: false, error: e.code ? '文件操作失败，请检查目录权限、磁盘空间或文件占用。工程仍保留在编辑器中。' : e.message }; }
    });
    const closeResult = (event, result) => {
        if (!trusted(event) || !closeRequest || result?.id !== closeRequest) return;
        closeRequest = '';
        if (result.saved === true) { allowClose = true; window.close(); }
    };
    ipcMain.on('director-save-close-result', closeResult);
    const download = (_event, item, contents) => {
        if (contents && contents !== window.webContents) return;
        item.setSaveDialogOptions({ title: text(window, '保存导演台文件'), defaultPath: host.defaultPath(item.getFilename()) });
    };
    session.on('will-download', download);
    window.webContents.on('did-start-navigation', details => { if (!details.isMainFrame || details.isSameDocument) return; closeRequest = ''; allowClose = false; void automation.close(); });
    window.on('closed', () => {
        void automation.close();
        ipcMain.removeHandler('director-files'); ipcMain.removeListener('director-save-close-result', closeResult);
        ipcMain.removeListener('director-close-state', closingState);
        session.removeListener('will-download', download);
    });
    return { ready: host.ready, preventUnload(event) {
        if (allowClose) { event.preventDefault(); return; }
        if (closeRequest) return;
        if (closeBusy) { dialog.showMessageBoxSync(window, { type: 'info', title: text(window, '退出导演台'), message: text(window, '请先完成或取消当前操作'), buttons: [text(window, '返回编辑')] }); return; }
        const choice = dialog.showMessageBoxSync(window, { type: 'question', title: text(window, '退出导演台'),
            message: text(window, '是否保存当前工程后退出？'),
            buttons: [text(window, '保存并退出'), text(window, '不保存退出'), text(window, '取消')], defaultId: 0, cancelId: 2, noLink: true });
        if (choice === 1) { allowClose = true; event.preventDefault(); }
        if (choice === 0) { closeRequest = randomUUID(); window.webContents.send('director-save-before-close', { id: closeRequest }); }
    } };
}
module.exports = { attachFiles };
