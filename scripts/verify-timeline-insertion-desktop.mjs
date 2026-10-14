import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {_electron as electron} from 'playwright-core';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const output=path.resolve('output/playwright/timeline-insertion');await fs.mkdir(output,{recursive:true});
const profile=await fs.mkdtemp(path.join(output,'desktop-')),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({executablePath:createRequire(import.meta.url)('electron'),args:[path.resolve('.audit/desktop-app'),`--director-test-profile=${profile}`],env});
const client=new Client({name:'timeline-insertion-test',version:'1'});
try{
    const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.waitForFunction(()=>window.directorDesktop);
    await page.locator('#timeline-content .track-lane').first().waitFor();
    const started=await page.evaluate(()=>window.directorDesktop.mcp(true));assert.equal(started.ok,true);
    const connection=JSON.parse(await fs.readFile(path.join(profile,'mcp-connection.json'),'utf8'));
    const token=await app.evaluate(({safeStorage},secret)=>safeStorage.decryptString(Buffer.from(secret,'base64')),connection.secret);
    await client.connect(new StreamableHTTPClientTransport(new URL(started.data.url),{requestInit:{headers:{Authorization:`Bearer ${token}`}}}));
    const call=async(name,args)=>{const raw=await client.callTool({name,arguments:args});const r=JSON.parse(raw.content.find(c=>c.type==='text').text);assert.equal(r.ok,true,r.error);return r.data;};
    const read=await call('director_read',{sections:[]});
    await call('director_apply',{revision:read.revision,requestId:'insertion-fixture',operations:[{operation:'add',asset:'human-adult',id:'insert-desktop-target',patch:{clips:[{id:'desktop-a',action:'walk',start:0,end:2,speed:1},{id:'desktop-b',action:'run',start:2,end:5,speed:1},{id:'desktop-c',action:'wave',start:5,end:7,speed:1}]}}]});
    const timings=async()=>{const r=await call('director_read',{ids:['insert-desktop-target'],sections:['entities'],details:true});return r.entities[0].clips.map(c=>[c.start,c.end]);};
    const bar=page.locator('[data-clip-id="desktop-c"]');await bar.scrollIntoViewIfNeeded();
    const b=await bar.boundingBox(),lane=await page.locator('[data-track-key="entity:insert-desktop-target"] .track-lane').boundingBox();
    await page.mouse.move(b.x+20,b.y+12);await page.mouse.down();await page.mouse.move(lane.x+150,b.y+12,{steps:8});
    assert.match(await page.locator('.motion-drop-status').innerText(),/插在前面/);await page.mouse.up();
    assert.deepEqual(await timings(),[[0,2],[4,7],[2,4]]);
    await page.keyboard.press('Control+z');assert.deepEqual(await timings(),[[0,2],[2,5],[5,7]]);
    await page.locator('[data-side="motions"]').click();await page.locator('#search').fill('basic-wave');
    await page.locator('[data-library-motion="basic-wave"]').dragTo(page.locator('[data-track-key="entity:insert-desktop-target"] .track-lane'),{targetPosition:{x:270,y:18}});
    assert.deepEqual(await timings(),[[0,2],[2,5],[5,8],[8,10]]);
    const play=page.locator('[data-act="play"]');assert.equal(await play.isEnabled(),true);assert.equal(await play.getAttribute('aria-label'),'播放');
    await play.click();await page.waitForFunction(()=>document.querySelector('[data-act="play"]').getAttribute('aria-label')==='暂停');await play.click();
    await page.screenshot({path:path.join(output,'desktop.png')});
    await page.keyboard.press('Control+z');assert.deepEqual(await timings(),[[0,2],[2,5],[5,7]]);
    assert.deepEqual(errors,[]);console.log('PASS: isolated desktop move/insert, library drop, MCP readback, one-click playback and undo');
}finally{await client.close().catch(()=>{});await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}
