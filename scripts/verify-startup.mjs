import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {chromium,_electron as electron} from 'playwright-core';
import {preview} from 'vite';

const output=path.resolve('output/playwright/startup');
await fs.mkdir(output,{recursive:true});
const server=await preview({preview:{host:'127.0.0.1',port:0,open:false}});
const address=server.httpServer.address();
const url=`http://127.0.0.1:${address.port}`;
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
    for(const [locale,saved,expected] of [['en-US',null,'en'],['zh-CN',null,'zh-CN'],['en-US','zh-CN','zh-CN'],['zh-CN','en','en']]) {
        const context=await browser.newContext({locale,viewport:{width:800,height:600}});
        await context.addInitScript(saved=>{
            if(saved)localStorage.setItem('director-ui-language',saved);
            const original=HTMLCanvasElement.prototype.getContext;
            HTMLCanvasElement.prototype.getContext=function(type,...args){
                if(type==='webgl2'&&!sessionStorage.getItem('restore-webgl'))return null;
                return original.call(this,type,...args);
            };
        },saved);
        const page=await context.newPage(),errors=[];
        page.on('pageerror',error=>errors.push(error.message));
        await page.goto(url);
        await page.locator('#startup-error').waitFor();
        assert.equal(await page.locator('html').getAttribute('lang'),expected);
        assert.equal(await page.locator('#startup-error h1').innerText(),expected==='en'?'Unable to start the 3D view':'无法启动三维画面');
        assert.equal(await page.locator('#stage-canvas').count(),0);
        assert.equal(await page.locator('#startup-error button').count(),1);
        assert.equal(await page.evaluate(()=>document.activeElement.id),'startup-error-title');
        if(expected==='en')assert.doesNotMatch(await page.locator('body').innerText(),/[\u3400-\u9fff]/);
        await page.screenshot({path:path.join(output,`${locale}-${saved??'system'}.png`)});
        // Retry succeeds once graphics are available, without discarding preferences.
        await page.evaluate(()=>sessionStorage.setItem('restore-webgl','1'));
        await page.locator('#startup-error button').click();
        await page.locator('#timeline-content .track-lane').first().waitFor({timeout:60000});
        assert.equal(await page.locator('html').getAttribute('lang'),expected);
        assert.equal(await page.locator('#startup-error').count(),0);
        assert.deepEqual(errors,[]);
        await context.close();
    }
    console.log('PASS: startup without WebGL2, system and saved languages, accessible failure screen, retry into editor');
} finally {
    await browser.close();
    await new Promise(resolve=>server.httpServer.close(resolve));
}

if(process.argv.includes('--desktop')) {
    for(const [locale,blocked] of [['en-US',true],['zh-CN',true],['en-US',false]]) {
        const profile=await fs.mkdtemp(path.join(output,'desktop-'));
        const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
        const app=await electron.launch({executablePath:createRequire(import.meta.url)('electron'),env,
            args:[path.resolve('.audit/desktop-app'),`--director-test-profile=${profile}`,`--lang=${locale}`]});
        try {
            await app.evaluate(({BrowserWindow})=>{
                BrowserWindow.prototype.show=function(){};
                for(const window of BrowserWindow.getAllWindows())window.hide();
            });
            const page=await app.firstWindow(),errors=[];
            page.on('pageerror',error=>errors.push(error.message));
            page.on('dialog',()=>{});
            if(blocked) {
                await page.addInitScript(()=>{
                    const original=HTMLCanvasElement.prototype.getContext;
                    HTMLCanvasElement.prototype.getContext=function(type,...args){
                        return type==='webgl2'?null:original.call(this,type,...args);
                    };
                });
                await app.evaluate(({dialog})=>{dialog.showMessageBoxSync=(_window,options)=>options.buttons.length===3?1:0;});
                await page.reload();
                await page.locator('#startup-error').waitFor();
                assert.equal(await page.locator('#startup-error h1').innerText(),locale==='en-US'?'Unable to start the 3D view':'无法启动三维画面');
                await page.locator('#startup-error button').first().click();
                await page.locator('#startup-error').waitFor();
                await app.evaluate(({dialog})=>{dialog.showMessageBoxSync=()=>0;});
                await Promise.all([app.waitForEvent('close'),page.getByRole('button',{name:locale==='en-US'?'Quit':'退出',exact:true}).click()]);
            } else {
                await page.locator('#timeline-content .track-lane').first().waitFor({timeout:60000});
                assert.equal(await page.locator('html').getAttribute('lang'),'en');
                await page.locator('.application-menu [data-act=video-reconstruction]').click();
                await page.locator('#recon-choose').waitFor();
            }
            assert.deepEqual(errors,[]);
        } finally {
            await app.evaluate(({app})=>app.exit(0)).catch(()=>{});
            await app.close().catch(()=>{});
        }
    }
    console.log('PASS: Electron simulated WebGL failure, English/Chinese, retry, Quit, normal editor and video reconstruction');
}
