import {_electron as electron} from 'playwright-core';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const root=path.resolve('tmp/video-to-project/acceptance');await fs.mkdir(root,{recursive:true});
const profile=await fs.mkdtemp(path.join(root,'profile-')),payload=path.resolve(process.env.DIRECTOR_TEST_APP||'.audit/desktop-app'),harness=path.join(root,'hidden.cjs');
await fs.writeFile(harness,`const {app,BrowserWindow}=require('electron');app.setAppPath(${JSON.stringify(payload)});BrowserWindow.prototype.show=function(){};BrowserWindow.prototype.focus=function(){};require(${JSON.stringify(path.join(payload,'desktop/main.cjs'))});`);
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
let app,client,errors=[];
const launch=async()=>{
    app=await electron.launch({executablePath:createRequire(import.meta.url)('electron'),args:[harness,`--director-test-profile=${profile}`],env});
    const page=await app.firstWindow();page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
    page.on('dialog',()=>{}); // Electron owns the native beforeunload prompt.
    await page.locator('#timeline-content .track-lane').first().waitFor();return page;
};
const close=async()=>{if(client){await client.close();client=null;}if(app){await app.evaluate(({app})=>app.exit(0));app=null;}};
const open=async page=>{await page.locator('.application-menu [data-act=video-reconstruction]').click();await page.locator('.reconstruction-workspace').waitFor();};
const ipc=async(page,action,data)=>{const r=await page.evaluate(async({action,data})=>window.directorDesktop.reconstruction(action,data),{action,data});assert.equal(r.ok,true,r.error);return r.data;};
try{
    let page=await launch();await open(page);
    assert.equal(await page.locator('.modal').count(),0);
    await page.locator('#recon-content').selectOption('people');
    assert.equal(await page.locator('#recon-scene').isVisible(),false);
    await page.locator('#recon-back').click();await open(page);
    assert.equal(await page.locator('#recon-content').inputValue(),'people');
    assert.equal(await page.locator('#recon-scene').isVisible(),false);
    await page.locator('#recon-content').selectOption('people-scene');
    assert.equal(await page.locator('#recon-scene').isVisible(),true);
    assert.equal(await page.locator('#recon-run').isEnabled(),true);
    await page.locator('#recon-run').click();
    assert.equal(await page.locator('#recon-license').isVisible(),true);
    await app.evaluate(({shell})=>{globalThis.reconstructionLinks=[];shell.openExternal=async url=>{globalThis.reconstructionLinks.push(url);};});
    await page.locator('#recon-project').click();await page.locator('#recon-source').click();
    const links=await app.evaluate(()=>globalThis.reconstructionLinks);
    assert.equal(links[0],'https://github.com/fanegg/Human3R');assert.ok(links[1].endsWith('/LICENSE'));
    await page.screenshot({path:path.join(root,'model-links.png')});
    await page.locator('.modal [data-act=close-modal]').first().click();assert.equal((await ipc(page,'state')).accepted,false);
    assert.equal((await ipc(page,'state')).job,null,'opening setup does not start a download or conversion');
    await page.locator('#recon-run').click();await page.locator('.reconstruction-settings-modal').waitFor();
    await page.locator('.modal [data-act=close-modal]').first().click();
    await open(page);
    for(const size of [[1280,800],[1000,720]]){
        await app.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0].setSize(...size),size);await page.waitForFunction(()=>{const w=document.querySelector('.workspace');return w.scrollWidth<=w.clientWidth;},null,{timeout:5000});
        const layout=await page.locator('.workspace').evaluate(modal=>({box:modal.getBoundingClientRect().toJSON(),width:innerWidth,height:innerHeight,overflow:modal.scrollWidth>modal.clientWidth}));
        if(layout.overflow){console.log('overflow',size,layout,await page.locator('.workspace').evaluate(w=>({columns:getComputedStyle(w).gridTemplateColumns,children:[...w.querySelectorAll('*')].filter(e=>e.getClientRects().length&&e.getBoundingClientRect().right>w.getBoundingClientRect().right+1).slice(0,12).map(e=>[e.id,e.className,e.getBoundingClientRect().right])})));await page.screenshot({path:path.join(root,'workspace-overflow.png')});}assert.equal(layout.overflow,false);assert.ok(layout.box.left>=0&&layout.box.right<=layout.width);
        const header=await page.locator('.header-actions').evaluate(root=>({width:innerWidth,boxes:[...root.querySelectorAll(':scope > button,:scope > select,:scope > .ai-access')].filter(e=>e.getClientRects().length).map(e=>e.getBoundingClientRect().toJSON())}));
        for(let i=0;i<header.boxes.length;i++){const box=header.boxes[i];assert.ok(box.left>=0&&box.right<=header.width,'header action fits');if(i)assert.ok(header.boxes[i-1].right<=box.left+1,'header actions do not overlap');}
    }
    await page.screenshot({path:path.join(root,'license.png')});
    const runtime=process.env.DIRECTOR_RECON_TEST_ROOT;
    if(runtime){
        await page.locator('#recon-configure').click();
        await page.locator('#recon-directory').fill(path.resolve(runtime));
        await page.locator('#recon-settings').click();
        await page.locator('#recon-accept').click();
        let state;
        for(let i=0;i<1800;i++){
            state=await ipc(page,'state');if(state.accepted&&state.ready&&state.job?.status!=='running'||state.job&&state.job.status!=='running')break;
            if(i%10===0)console.log('install:',state.job?.message,Math.round(state.job?.progress||0)+'%');
            await page.waitForTimeout(1000);
        }
        assert.equal(state.ready,true,JSON.stringify(state.job));
        await close();page=await launch();await open(page);
        assert.equal(await page.locator('#recon-setup').isVisible(),false,'license remembered after restart');
        const started=await page.evaluate(()=>window.directorDesktop.mcp());assert.equal(started.ok,true);
        const connection=JSON.parse(await fs.readFile(path.join(profile,'mcp-connection.json'),'utf8'));
        const token=await app.evaluate(({safeStorage},secret)=>safeStorage.decryptString(Buffer.from(secret,'base64')),connection.secret);
        client=new Client({name:'reconstruction-test',version:'1.0.0'});
        await client.connect(new StreamableHTTPClientTransport(new URL(started.data.url),{requestInit:{headers:{Authorization:`Bearer ${token}`}}}));
        const call=async(name,args)=>{const r=JSON.parse((await client.callTool({name,arguments:args})).content.find(c=>c.type==='text').text);assert.equal(r.ok,true,r.error);return r.data;};
        const listed=await client.listTools();assert.ok(listed.tools.some(t=>t.name==='director_reconstruct'));
        const before=await call('director_read',{sections:[]});
        const source=process.env.DIRECTOR_RECON_TEST_VIDEO||path.join(runtime,'runtime/win32-x64/repos/Human3R/examples/GoodMornin1.mp4');
        await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},path.resolve(source));
        await page.locator('#recon-choose').click();
        await page.waitForFunction(()=>document.querySelector('#recon-video-player').readyState>=1,null,{timeout:30000});
        const start=Number(process.env.DIRECTOR_RECON_TEST_START??4),seconds=Number(process.env.DIRECTOR_RECON_TEST_SECONDS??3);
        await page.locator('#recon-start').fill(String(start));await page.locator('#recon-start').dispatchEvent('change');
        await page.locator('#recon-end').fill(String(start+seconds));await page.locator('#recon-end').dispatchEvent('change');
        if(process.env.DIRECTOR_RECON_TEST_FPS)await page.locator('#recon-fps').selectOption(process.env.DIRECTOR_RECON_TEST_FPS);
        if(process.env.DIRECTOR_RECON_TEST_SCENE==='none')await page.locator('#recon-content').selectOption('people');
        else if(process.env.DIRECTOR_RECON_TEST_SCENE)await page.locator('#recon-scene').selectOption(process.env.DIRECTOR_RECON_TEST_SCENE);
        await page.locator('#recon-run').click();
        assert.equal(await page.locator('.reconstruction-viewports').getAttribute('data-view'),'split','starting conversion reveals recognition after trimming the source');
        await app.evaluate(({dialog,BrowserWindow})=>{
            const original=dialog.showMessageBoxSync;
            globalThis.reconstructionCloseMessage=null;
            dialog.showMessageBoxSync=(_window,options)=>{globalThis.reconstructionCloseMessage=options.message;return options.cancelId??0;};
            globalThis.restoreReconstructionDialog=()=>{dialog.showMessageBoxSync=original;};
            BrowserWindow.getAllWindows()[0].close();
        });
        await page.waitForTimeout(100);
        assert.equal(await app.evaluate(()=>globalThis.reconstructionCloseMessage),'请先完成或取消当前操作');
        assert.equal(await page.locator('.reconstruction-workspace').isVisible(),true,'active conversion keeps the editor open');
        await app.evaluate(()=>globalThis.restoreReconstructionDialog());
        let sawSource=false,sawSpace=false;
        for(let i=0;i<600;i++){
            const preview=await ipc(page,'preview',{});if(preview?.source)sawSource=true;if(preview?.camera&&preview?.actors?.length)sawSpace=true;
            state=await call('director_reconstruct',{action:'state'});assert.equal(state.model.licenseText,undefined);
            if(state.job&&state.job.status!=='running')break;
            if(i%10===0)console.log('convert:',state.job?.message);
            await page.waitForTimeout(1000);
        }
        assert.equal(state.job?.status,'completed',JSON.stringify(state.job));
        if(process.env.DIRECTOR_RECON_TEST_SCENE==='none'){
            assert.equal(state.job.input.scene,'none');
            const scene=JSON.parse(await fs.readFile(path.join(path.dirname(state.job.file),'scene.json'),'utf8'));
            assert.ok(scene.objects.some(o=>o.kind==='actor'));assert.ok(scene.objects.every(o=>o.kind==='actor'));assert.ok(scene.cameras.length>1);
            const preview=await ipc(page,'preview',{});assert.equal(preview.points.length,0);
        }
        assert.ok(sawSource,'real source frame delivered');assert.ok(sawSpace,'real spatial preview delivered');
        const recorded=await call('director_reconstruct',{action:'preview',history:true});assert.ok(recorded.frames.length>1);
        const sample=await call('director_reconstruct',{action:'preview',frame:recorded.frames[0].sequence});assert.equal(sample.sequence,recorded.frames[0].sequence);
        await page.locator('[data-result-time]').waitFor();
        await page.locator('[data-result-time]').fill('0');await page.locator('[data-result-time]').dispatchEvent('input');
        await page.waitForFunction(start=>Math.abs(document.querySelector('#recon-video-player').currentTime-start)<.03,start);
        const files=await fs.readdir(path.dirname(state.job.file));assert.ok(!files.some(f=>f.endsWith('.npz')||f.endsWith('.glb')),'completed run cleans raw predictions and duplicate models');
        await page.locator('#recon-space canvas:visible').waitFor();await page.screenshot({path:path.join(root,'preview.png')});
        assert.equal((await call('director_read',{sections:[]})).revision,before.revision,'conversion does not edit current project');
        await call('director_apply',{revision:before.revision,requestId:'unsaved-test',operations:[{operation:'project',patch:{name:'Unsaved reconstruction test'}}]});
        await page.locator('#recon-open').click();await page.locator('#recon-keep').waitFor({state:'visible'});
        await page.locator('#recon-keep').click();assert.equal((await call('director_read',{sections:[]})).name,'Unsaved reconstruction test');
        // Cancelling the existing save dialog must keep both the editor and conversion result.
        await app.evaluate(({dialog})=>{dialog.showSaveDialog=async()=>({canceled:true,filePath:undefined});});
        await page.locator('#recon-open').click();await page.locator('#recon-save-open').click();
        await page.waitForTimeout(200);assert.equal((await call('director_read',{sections:[]})).name,'Unsaved reconstruction test');
        await page.locator('#recon-discard').click();await page.locator('.reconstruction-workspace').waitFor({state:'detached'});
        const scene=await call('director_read',{sections:['entities']});assert.equal(scene.duration,seconds);
        await page.screenshot({path:path.join(root,'result.png')});
        await fs.writeFile(path.join(root,'result.json'),JSON.stringify({passed:true,job:state.job,entityCount:scene.entityCount,errors},null,2));
    }
    assert.deepEqual(errors,[]);console.log('Video reconstruction desktop checks passed'+(runtime?' (real download / runtime setup / inference / MCP / open)':' (UI only)'));
}finally{await close();}
