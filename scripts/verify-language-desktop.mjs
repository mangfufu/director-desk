import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {_electron as electron} from 'playwright-core';

const output=path.resolve('output/playwright/language');await fs.mkdir(output,{recursive:true});
const profile=await fs.mkdtemp(path.join(output,'desktop-')),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const appPath=path.resolve(process.env.DIRECTOR_APP_PATH||'.audit/desktop-app');
const launch=()=>electron.launch({executablePath:createRequire(import.meta.url)('electron'),args:[appPath,`--director-test-profile=${profile}`],env});
let app=await launch();
try {
    const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    // Electron owns beforeunload dialogs; do not let Playwright auto-dismiss them.
    page.on('dialog',()=>{});
    await page.locator('#timeline-content .track-lane').first().waitFor();
    await page.evaluate(()=>document.querySelector('#settings-toggle').click());
    await page.locator('#ui-language').selectOption('en');
    assert.equal(await page.locator('[data-settings-category="navigation"]').innerText(),'Navigation');
    await page.locator('[data-act="close-modal"]').first().click();
    await page.waitForFunction(()=>document.title.includes('DirectorDesk'));
    const title=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getTitle());
    assert.ok(title.endsWith('DirectorDesk · Development Build'),title);
    await app.evaluate(({dialog})=>{
        globalThis.__languageDialogs=[];
        dialog.showOpenDialog=async(_window,options)=>{globalThis.__languageDialogs.push(options);return {canceled:true,filePaths:[]};};
        dialog.showMessageBoxSync=(_window,options)=>{globalThis.__languageDialogs.push(options);return options.cancelId??0;};
    });
    const folders=await page.evaluate(()=>window.directorDesktop.files('choose','projects'));assert.equal(folders.ok,true,folders.error);
    let dialogs=await app.evaluate(()=>globalThis.__languageDialogs);
    assert.equal(dialogs.at(-1).title,'Default Project Folder');
    await page.locator('[data-field="name"]').fill('保存');await page.locator('[data-field="name"]').press('Tab');
    assert.equal(await page.locator('#inspector-header h2').innerText(),'保存');
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());
    await page.waitForTimeout(200);
    dialogs=await app.evaluate(()=>globalThis.__languageDialogs);
    assert.deepEqual(dialogs.at(-1).buttons,['Save and Quit','Quit Without Saving','Cancel']);
    await page.locator('.header-actions [data-act="export"]').click();
    assert.equal(await page.locator('#export-format').inputValue(),'mp4');
    await page.screenshot({path:path.join(output,'desktop-export.png')});
    await page.locator('[data-act="close-modal"]').first().click();
    await app.evaluate(({dialog})=>{dialog.showMessageBoxSync=()=>1;});
    await page.reload();await page.locator('#timeline-content .track-lane').first().waitFor();
    assert.equal(await page.locator('html').getAttribute('lang'),'en');
    assert.deepEqual(errors,[]);
    await app.evaluate(({app})=>app.exit(0));await app.close();
    app=await launch();const reopened=await app.firstWindow();await reopened.locator('#timeline-content .track-lane').first().waitFor();
    assert.equal(await reopened.locator('html').getAttribute('lang'),'en');
    console.log('PASS: desktop language, restart persistence, native folder/exit dialogs, export panel and user name');
}finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}
