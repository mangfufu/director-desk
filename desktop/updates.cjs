const { text } = require('./language.cjs');
const { app, ipcMain, dialog, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { NsisUpdater } = require('electron-updater/out/NsisUpdater');
const { withRevisionVersions } = require('./revision-updater.cjs');
const RevisionUpdater = withRevisionVersions(NsisUpdater);
const { createUpdateConfig } = require('./update-config.cjs');
const { createUpdateHost } = require('./update-host.cjs');
const { githubRelease } = require('./github-release.cjs');
function attachUpdates(window, integration) {
    let quitting = false;
    // The updater chain (NsisUpdater + quitAndInstall) is Windows-specific; packaged mac builds only offer the release page.
    const mode = !app.isPackaged ? 'development' : process.platform === 'darwin' ? 'unsupported'
        : fs.existsSync(path.join(path.dirname(app.getPath('exe')), 'portable.json')) ? 'portable' : 'installed';
    const host = createUpdateHost({ version: app.getVersion(), mode, config: createUpdateConfig(app.getPath('userData')),
        makeUpdater: feed => new RevisionUpdater(feed), getGithubRelease: githubRelease,
        send: state => { if (!window.isDestroyed()) window.webContents.send('director-update-state', state); },
        confirmInstall: async () => {
            if (integration.isBusy()) throw Error('请等待 AI 或工具任务完成后再更新');
            const choice = dialog.showMessageBoxSync(window, { type: 'question', title: text(window, '重启安装更新'), message: text(window, '现在关闭导演台并安装新版本？'),
                detail: text(window, '当前工程的自动恢复副本已保存。对话和渠道配置保留在本机。'), buttons: [text(window, '稍后'), text(window, '重启安装')], defaultId: 0, cancelId: 0, noLink: true });
            return choice === 1;
        },
        install: updater => { quitting = true; updater.once('error', () => { quitting = false; }); updater.quitAndInstall(false, true); },
        openPage: url => shell.openExternal(url),
    });
    ipcMain.handle('director-updates', async (event, input) => {
        if (event.sender !== window.webContents || event.senderFrame?.url !== 'director://app/') throw Error('拒绝未知页面');
        try {
            const action = input?.action; let data;
            if (action === 'state') { await host.initialize(); data = host.read(); }
            else if (action === 'save') data = await host.save(input.data);
            else if (action === 'check') data = await host.check();
            else if (action === 'download') data = await host.download();
            else if (action === 'install') data = await host.install();
            else if (action === 'page') { await host.openPage(); data = host.read(); }
            else throw Error('未知更新操作');
            return { ok: true, data };
        } catch (error) { return { ok: false, error: error.message }; }
    });
    const timer = setTimeout(async () => { try { await host.initialize(); if (mode !== 'development') await host.check(); } catch { /* Startup checks stay silent when offline. */ } }, 3000);
    timer.unref();
    window.on('closed', () => { clearTimeout(timer); host.dispose(); ipcMain.removeHandler('director-updates'); });
    return { isQuitting: () => quitting };
}
module.exports = { attachUpdates };
