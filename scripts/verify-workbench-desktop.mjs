import {_electron as electron} from 'playwright-core';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=path.resolve('output/playwright/workbench-desktop');await fs.mkdir(root,{recursive:true});
const profile=await fs.mkdtemp(path.join(root,'profile-'));
const payload=path.resolve('.audit/desktop-app'),harness=path.join(root,'hidden.cjs');
await fs.writeFile(harness,`const {app,BrowserWindow}=require('electron');
app.setAppPath(${JSON.stringify(payload)});
// The production app calls show on ready-to-show; intercept it in this test only.
BrowserWindow.prototype.show=function(){};BrowserWindow.prototype.focus=function(){};
require(${JSON.stringify(path.join(payload,'desktop/main.cjs'))});`);
let app,previousClipboard;
try {
    const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
    app=await electron.launch({executablePath:path.resolve('node_modules/electron/dist/electron.exe'),args:[harness,`--director-test-profile=${profile}`,'--disable-gpu'],timeout:30000,env});
    const page=await app.firstWindow();page.setDefaultTimeout(15000);console.log('desktop ready');await page.locator('#timeline-content .track-lane').first().waitFor();
    assert.equal(await page.locator('html').getAttribute('data-window-chrome'),'custom');
    const usage=await page.evaluate(()=>window.directorDesktop.appMetrics());
    assert.equal(usage.ok,true);assert.ok(usage.data.memoryBytes>0);
    // A new GPU/utility process invalidates the first CPU delta for that PID.
    // Wait for two stable samples rather than assuming startup finishes in 1.2 s.
    let nextUsage;
    for(let attempt=0;attempt<12;attempt++){
        await page.waitForTimeout(1200);
        nextUsage=await page.evaluate(()=>window.directorDesktop.appMetrics());
        if(nextUsage.ok&&typeof nextUsage.data.cpu==='number'&&Number.isFinite(nextUsage.data.cpu))break;
    }
    assert.ok(nextUsage.data.cpu!==null&&nextUsage.data.cpu>=0&&nextUsage.data.cpu<=100,JSON.stringify(nextUsage));
    assert.equal(await page.locator('#app-usage').isVisible(),true);
    assert.equal(await page.locator('.inspect-subtitle,#inspector-content h3').count(),0);
    assert.notEqual(await page.locator('#scene-switch').evaluate(el=>getComputedStyle(el).backgroundImage),'none');
    await page.locator('#resource-home').click();await page.locator('.asset-card').first().waitFor();
    await page.locator('#asset-tile-size').selectOption('72');
    await page.locator('[data-side=motions]').click();await page.locator('.motion-library-item').first().hover();
    await page.locator('.motion-hover-preview canvas').waitFor();
    await page.waitForFunction(()=>!document.querySelector('.motion-hover-status').textContent.includes('加载'));
    assert.ok(!(await page.locator('.motion-hover-preview').innerText()).includes('不可用'));
    await page.screenshot({path:path.join(root,'library-hover.png')});
    await page.locator('[data-side=scene]').click();assert.equal(await page.locator('.motion-hover-preview').count(),0);
    assert.equal(await page.locator('#window-project-title').innerText(),await page.title());
    assert.equal(await page.locator('.window-menu-row').evaluate(el=>getComputedStyle(el).getPropertyValue('-webkit-app-region')),'drag');
    assert.equal(await page.locator('.window-menu-row .application-menu').evaluate(el=>getComputedStyle(el).getPropertyValue('-webkit-app-region')),'no-drag');
    for(const [width,height] of [[1600,1000],[1000,720]]){console.log('size',width);
        await app.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0].setSize(...size),[width,height]);
        await page.waitForFunction(w=>Math.abs(innerWidth-w)<30,width);
        const layout=await page.evaluate(()=>{
            const area=document.querySelector('.window-controls').getBoundingClientRect();
            return {area:area.toJSON(),title:document.querySelector('#window-project-title').getBoundingClientRect().toJSON(),row:document.querySelector('.window-menu-row').getBoundingClientRect().toJSON(),controls:[...document.querySelectorAll('.topbar button,.topbar select')].filter(el=>el.getClientRects().length).map(el=>el.getBoundingClientRect().toJSON()),width:innerWidth};
        });
        assert.equal(layout.row.y,0);assert.equal(layout.row.height,34);
        assert.equal(await page.locator('#save-status').isVisible(),true);
        const footer=await page.locator('.statusbar').evaluate(el=>['#scene-status','#app-usage','#save-status'].map(s=>el.querySelector(s).getBoundingClientRect().toJSON()));
        assert.ok(footer[0].right<=footer[1].left&&footer[1].right<=footer[2].left,'status groups do not overlap');
        assert.ok(layout.title.right<=layout.area.left,'project title stays outside caption buttons');assert.ok(Math.abs(layout.area.right-layout.row.right)<.01,'caption buttons fill the titlebar edge');assert.ok(Math.abs(layout.area.right-layout.width)<1,'DPI viewport rounding stays below one CSS pixel');assert.equal(layout.area.y,0);
        for(const box of layout.controls){assert.ok(box.x>=0&&box.right<=layout.width,'top controls fit');if(box.y<34)assert.ok(box.right<=layout.area.right,'menu stays inside the window');}
        await page.screenshot({path:path.join(root,`titlebar-${width}.png`)});
    }
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1600,1000));
    await app.evaluate(async({clipboard})=>{globalThis.__workbenchClipboard=await clipboard.read();});previousClipboard=true;
    assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().some(w=>w.isVisible())),false);
    await page.locator('#scene-prompt-toggle').click();const field=page.locator('#production-prompt-text');await field.fill('Native clipboard');
    await field.evaluate(el=>{el.focus();el.setSelectionRange(0,6);});await field.click({button:'right',position:{x:20,y:12}});await page.locator('[data-context-command=text-copy]').click();
    assert.equal(await app.evaluate(({clipboard})=>clipboard.readText()),'Native');
    await field.evaluate(el=>{el.focus();el.setSelectionRange(0,6);});await field.click({button:'right',position:{x:20,y:12}});await page.locator('[data-context-command=text-cut]').click();
    await page.waitForFunction(()=>document.querySelector('#production-prompt-text').value===' clipboard');
    await page.keyboard.press('Control+z');assert.equal(await field.inputValue(),'Native clipboard');
    await app.evaluate(({clipboard})=>clipboard.writeText('Desktop'));
    await field.evaluate(el=>{el.focus();el.setSelectionRange(0,6);});await field.click({button:'right',position:{x:20,y:12}});await page.locator('[data-context-command=text-paste]').click();
    await page.waitForFunction(()=>document.querySelector('#production-prompt-text').value==='Desktop clipboard');
    assert.equal((await page.evaluate(()=>window.directorDesktop.editText('reload'))).ok,false);
    await page.locator('[data-act=close-modal]').first().click();
    await page.evaluate(()=>window.__workbenchRefreshSentinel=true);
    await page.keyboard.press('F5');await page.keyboard.press('Control+r');await page.keyboard.press('Control+-');
    assert.equal(await page.evaluate(()=>window.__workbenchRefreshSentinel),true);
    assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.getZoomFactor()),1);
    assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().some(w=>w.isVisible())),false);
    await page.locator('[data-act=add-camera]').click();
    assert.equal(await page.locator('.numeric-dial').count(),3);
    const focal=page.locator('[data-field="camera.focal"]');
    await focal.fill('70');await focal.press('Enter');assert.equal(await focal.inputValue(),'70');
    const dial=page.locator('.numeric-dial input[type=range]').first(),dialBox=await dial.boundingBox();
    await page.mouse.move(dialBox.x+24,dialBox.y+24);await page.mouse.down();await page.mouse.move(dialBox.x+24,dialBox.y-6,{steps:5});
    assert.ok(Number(await focal.inputValue())>70);await page.mouse.up();await page.keyboard.press('Control+z');assert.equal(await focal.inputValue(),'70');
    assert.equal(await page.locator('#ai-panel').evaluate(el=>getComputedStyle(el).boxShadow),'none');
    assert.equal((await page.evaluate(()=>window.directorDesktop.windowControl('destroy'))).ok,false);
    // Test IPC/state changes without maximize/minimize bringing a hidden window onscreen.
    await app.evaluate(({BrowserWindow})=>{
        const win=BrowserWindow.getAllWindows()[0];
        let maximized=false;win.isMaximized=()=>maximized;
        win.maximize=()=>{maximized=true;win.emit('maximize')};
        win.unmaximize=()=>{maximized=false;win.emit('unmaximize')};
        win.minimize=()=>{globalThis.__captionMinimized=true};
        win.on('close',event=>{event.preventDefault();globalThis.__captionClosed=true});
    });
    await page.locator('[data-window-command=maximize]').click();
    await page.waitForFunction(()=>document.querySelector('[data-window-command=maximize]').getAttribute('aria-label')==='还原窗口');
    assert.equal((await page.evaluate(()=>window.directorDesktop.windowControl('state'))).data.maximized,true);
    await page.locator('[data-window-command=maximize]').click();
    await page.waitForFunction(()=>document.querySelector('[data-window-command=maximize]').getAttribute('aria-label')==='最大化');
    await page.locator('[data-window-command=minimize]').click();assert.equal(await app.evaluate(()=>globalThis.__captionMinimized),true);
    await page.locator('[data-window-command=close]').click();
    await page.waitForTimeout(100);assert.equal(await app.evaluate(()=>globalThis.__captionClosed),true);
    assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length),1,'close remains cancellable');
    await page.screenshot({path:path.join(root,'desktop.png')});
    console.log('PASS: hidden production Electron, custom caption controls, cancellable close, window command validation and aligned titlebar, clipboard copy/cut/paste/undo, IPC command validation, refresh and page-zoom protection');
} catch(error) {console.error('Desktop verification failed:',error);throw error;} finally {
    if(app){
        if(previousClipboard)await app.evaluate(async({clipboard})=>{await clipboard.write(globalThis.__workbenchClipboard);delete globalThis.__workbenchClipboard;}).catch(()=>{});
        await Promise.race([app.evaluate(({app})=>app.exit(0)).catch(()=>{}),new Promise(resolve=>setTimeout(resolve,3000))]);if(app.process().exitCode===null)app.process().kill();await app.close().catch(()=>{});
    }
    // Only the isolated test profile is removed; no user configuration is touched.
    if(path.dirname(profile)!==root)throw Error('Unexpected test profile path');
    await fs.rm(profile,{recursive:true,force:true,maxRetries:4,retryDelay:250});
    await fs.rm(harness,{force:true});
}
