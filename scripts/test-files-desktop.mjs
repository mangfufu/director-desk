import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { _electron as electron } from 'playwright-core';

const root = await fs.mkdtemp(path.resolve('tmp/files-desktop-'));
const profile = path.join(root, 'profile'), projects = path.join(root, 'projects'), exports = path.join(root, 'exports'), chosen = path.join(root, 'chosen-projects');
for (const dir of [profile, projects, exports, chosen]) await fs.mkdir(dir, { recursive: true });
await fs.writeFile(path.join(profile, 'file-locations.json'), JSON.stringify({ projects, exports }));
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ executablePath: createRequire(import.meta.url)('electron'), args: [path.resolve(process.env.DIRECTOR_TEST_APP || '.audit/desktop-app'), `--director-test-profile=${profile}`], env });
let closed = false;
try {
    await app.evaluate(({ dialog }, { root, chosen }) => {
        globalThis.fileTest = { choice: 2, canceled: true, filename: root + '/saved.director', chosen, dialogs: [], saves: [] };
        dialog.showMessageBoxSync = (_window, options) => { globalThis.fileTest.dialogs.push(options); return globalThis.fileTest.choice; };
        dialog.showSaveDialog = async (_window, options) => { const t=globalThis.fileTest; t.saves.push(options); return { canceled: t.canceled, filePath: t.filename }; };
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [globalThis.fileTest.chosen] });
    }, { root, chosen });
    const page = await app.firstWindow();
    // Electron's native will-prevent-unload handler owns this dialog, not CDP.
    page.on('dialog', () => {});
    await page.waitForSelector('.application-menu');
    await page.locator('#resource-home').click();
    await app.evaluate(({BrowserWindow})=>{globalThis.fileTest.choice=1;BrowserWindow.getAllWindows()[0].close();});
    await page.waitForTimeout(250);
    const cleanDialog=await app.evaluate(()=>globalThis.fileTest.dialogs.at(-1));
    assert.equal(cleanDialog.title,'退出导演台');assert.equal(cleanDialog.message,'确定要退出吗');
    assert.deepEqual(cleanDialog.buttons,['确认','取消']);assert.equal(cleanDialog.cancelId,1);
    assert.equal(await page.locator('.application-menu').isVisible(),true,'cancel keeps clean project open');
    await app.evaluate(()=>{globalThis.fileTest.choice=2;});
    await page.locator('[data-menu="edit"]').click();await page.locator('#settings-toggle').click(); await page.locator('[data-settings-category="files"]').click(); await page.locator('[data-setting="files"]').click();
    assert.equal(await page.locator('#location-projects').inputValue(), projects);
    assert.equal(await page.locator('#location-exports').inputValue(), exports);
    await page.locator('[data-location="projects"]').click();
    await page.waitForFunction(p => document.querySelector('#location-projects').value === p, chosen);
    assert.equal(JSON.parse(await fs.readFile(path.join(profile, 'file-locations.json'))).projects, chosen);
    await page.screenshot({ path: path.join(root, 'locations.png') });
    await page.locator('.modal-footer [data-act="close-modal"]').click();
    // Exercise real renderer -> preload -> IPC -> filesystem delivery, with no save dialog.
    await page.locator('[data-menu="file"]').click();await page.locator('[data-menu-copy="export"]').click();
    await page.locator('#export-name').fill('renamed-export');
    await page.locator('#export-end').fill('.25');
    await page.locator('#export-size').selectOption('640');
    assert.equal(await page.locator('#export-save').inputValue(), 'default');
    await page.locator('[data-act="export-start"]').click();
    await page.waitForSelector('.export-modal', { state: 'detached', timeout: 60000 });
    assert.ok((await fs.stat(path.join(exports, 'renamed-export.mp4'))).size > 1000);
    const duplicate = await page.evaluate(async () => window.directorDesktop.files('save-export', {
        name: 'renamed-export.mp4', bytes: new Uint8Array([1,2,3]).buffer,
    }));
    assert.deepEqual(duplicate, { ok: true, data: { saved: true, filename: 'renamed-export (2).mp4' } });
    const badName = await page.evaluate(async () => window.directorDesktop.files('save-export', {
        name: '../escape.mp4', bytes: new Uint8Array([1,2,3]).buffer,
    }));
    assert.equal(badName.ok, false);
    await page.locator('#duration').fill('36'); await page.locator('#duration').press('Tab');
    const attemptClose = async () => {
        await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0].close(); });
        await page.waitForTimeout(250);
    };
    await attemptClose();
    let state = await app.evaluate(() => globalThis.fileTest);
    assert.deepEqual(state.dialogs.at(-1).buttons, ['保存并退出','不保存并退出','取消']);
    assert.equal(state.dialogs.at(-1).title,'退出导演台');assert.equal(state.dialogs.at(-1).message,'检测到未保存更改');
    assert.equal(state.dialogs.at(-1).cancelId, 2); assert.equal(state.saves.length, 0);
    await app.evaluate(() => { globalThis.fileTest.choice = 0; });
    await attemptClose();
    state = await app.evaluate(() => globalThis.fileTest);
    assert.equal(state.saves.length, 1); assert.equal(path.dirname(state.saves[0].defaultPath), chosen);
    assert.equal(await page.locator('#duration').inputValue(), '36');
    await app.evaluate((_, root) => { globalThis.fileTest.canceled = false; globalThis.fileTest.filename = root + '/missing-parent/fail.director'; }, root);
    await attemptClose();
    assert.equal(await page.locator('#duration').inputValue(), '36');
    await app.evaluate(({ BrowserWindow }) => {
        const w=BrowserWindow.getAllWindows()[0];
        w.webContents.session.emit('will-download', {}, { getFilename: () => 'reference.mp4', setSaveDialogOptions: options => { globalThis.fileTest.exportOptions = options; } }, w.webContents);
    });
    assert.equal(path.dirname(await app.evaluate(() => globalThis.fileTest.exportOptions.defaultPath)), exports);
    await app.evaluate((_, root) => { globalThis.fileTest.filename = root + '/saved.director'; }, root);
    const done = app.waitForEvent('close', { timeout: 30000 });
    await app.evaluate(({ BrowserWindow }) => { setTimeout(() => BrowserWindow.getAllWindows()[0].close(), 0); });
    await done; closed = true;
    const saved = JSON.parse(await fs.readFile(path.join(root, 'saved.director'), 'utf8'));
    assert.equal(saved.scenes.find(s => s.id === saved.activeSceneId).state.duration, 36);
    const second = await electron.launch({ executablePath: createRequire(import.meta.url)('electron'), args: [path.resolve(process.env.DIRECTOR_TEST_APP || '.audit/desktop-app'), `--director-test-profile=${profile}`], env });
    try {
        await second.evaluate(({ dialog }) => {globalThis.reopenedExit=[];dialog.showMessageBoxSync = (_,options) => {globalThis.reopenedExit.push(options);return 1;}; });
        const reopened = await second.firstWindow(); reopened.on('dialog', () => {});
        await reopened.waitForSelector('.application-menu');
        await reopened.waitForFunction(()=>document.querySelector('#duration')?.value==='36');
        await reopened.locator('#resource-home').click();
        await second.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());await reopened.waitForTimeout(250);
        assert.equal(await second.evaluate(()=>globalThis.reopenedExit.at(-1).message),'确定要退出吗','saved recovered project has no unsaved changes');
        const locations = await reopened.evaluate(() => window.directorDesktop.files('locations'));
        assert.equal(locations.data.projects, chosen); assert.equal(locations.data.exports, exports);
        await reopened.locator('#duration').fill('37'); await reopened.locator('#duration').press('Tab');
        const discarded = second.waitForEvent('close', { timeout: 30000 });
        await second.evaluate(({ BrowserWindow }) => { setTimeout(() => BrowserWindow.getAllWindows()[0].close(), 0); });
        await discarded;
        assert.equal(JSON.parse(await fs.readFile(path.join(root, 'saved.director'))).scenes[0].state.duration, 36);
    } finally { await second.evaluate(({app})=>app.exit(0)).catch(()=>{});await second.close().catch(() => {}); }
    const cleanProfile=path.join(root,'clean-profile');await fs.mkdir(cleanProfile);
    const third=await electron.launch({executablePath:createRequire(import.meta.url)('electron'),args:[path.resolve(process.env.DIRECTOR_TEST_APP||'.audit/desktop-app'),`--director-test-profile=${cleanProfile}`],env});
    try {
        await third.evaluate(({dialog})=>{globalThis.cleanExit=[];dialog.showMessageBoxSync=(_,options)=>{globalThis.cleanExit.push(options);return 1;};});
        const p=await third.firstWindow();p.on('dialog',()=>{});await p.waitForSelector('.application-menu');
        await p.locator('#resource-home').click();
        await third.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());await p.waitForTimeout(250);
        assert.deepEqual(await third.evaluate(()=>globalThis.cleanExit.at(-1).buttons),['确认','取消']);
        await third.evaluate(({dialog})=>{dialog.showMessageBoxSync=()=>0;});
        const ended=third.waitForEvent('close',{timeout:30000});
        await third.evaluate(({BrowserWindow})=>setTimeout(()=>BrowserWindow.getAllWindows()[0].close(),0));await ended;
    } finally {await third.evaluate(({app})=>app.exit(0)).catch(()=>{});await third.close().catch(()=>{});}
    console.log(JSON.stringify({ ok: true, checks: ['native directory settings', 'restart preserves folders', 'cancel exit', 'cancel save stays open', 'write failure stays open', 'actual named video export to default directory', 'IPC preserves existing files and rejects paths', 'save finishes before exit', 'discard leaves saved file unchanged'] }));
} finally { if (!closed) {await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(() => {});} }
