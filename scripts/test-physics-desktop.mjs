import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {_electron as electron} from 'playwright-core';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
await fs.mkdir('tmp/physics',{recursive:true});const profile=await fs.mkdtemp(path.resolve('tmp/physics/desktop-'));
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({executablePath:createRequire(import.meta.url)('electron'),args:[path.resolve('.audit/desktop-app'),`--director-test-profile=${profile}`],env});
const client=new Client({name:'physics-test',version:'1'});
try{
    assert.equal(path.resolve(await app.evaluate(({app})=>app.getPath('userData'))),path.resolve(profile));
    const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForFunction(()=>window.directorDesktop);
    const started=await page.evaluate(()=>window.directorDesktop.mcp(true));assert.equal(started.ok,true);
    const connection=JSON.parse(await fs.readFile(path.join(profile,'mcp-connection.json'),'utf8'));
    const token=await app.evaluate(({safeStorage},secret)=>safeStorage.decryptString(Buffer.from(secret,'base64')),connection.secret);
    await client.connect(new StreamableHTTPClientTransport(new URL(started.data.url),{requestInit:{headers:{Authorization:`Bearer ${token}`}}}));
    const call=async(name,args)=>{const raw=await client.callTool({name,arguments:args}),result=JSON.parse(raw.content.find(c=>c.type==='text').text);assert.equal(result.ok,true,result.error);return result.data;};
    const body={enabled:true,mode:'dynamic',gravity:true,collisions:true,inertia:true,ragdoll:false,shape:'box',start:0,mass:2,friction:.5,restitution:.1,damping:.05,velocity:[0,0,0],angularVelocity:[0,0,0],impulses:[]};
    // The preload and HTTP server can be ready before the editor has attached its tool handler.
    let read;
    for(let attempt=0;attempt<100;attempt++){
        const raw=await client.callTool({name:'director_read',arguments:{sections:['cuts']}}),result=JSON.parse(raw.content.find(c=>c.type==='text').text);
        if(result.ok){read=result.data;break;}
        assert.match(result.error,/尚未连接或正在重新载入/);
        await new Promise(resolve=>setTimeout(resolve,100));
    }
    assert.ok(read,'editor MCP handler did not become ready');
    await call('director_apply',{revision:read.revision,requestId:'physics-setup',operations:[
        {operation:'cuts',value:[{time:0,cameraId:read.cuts[0].cameraId}]},
        {operation:'project',patch:{duration:6,room:{enabled:false,width:6,depth:6,height:3},physics:{enabled:true,gravity:[0,-9.81,0],ground:true}}},
        {operation:'add',id:'physics-prop',asset:'cube',position:[3,4,1],patch:{physics:body}},
        {operation:'add',id:'physics-human',asset:'human-adult',position:[-3,0,1],patch:{physics:{...body,mass:60,ragdoll:true,start:1,impulses:[{time:1,impulse:[60,40,0],point:[0,0,0]}]},clips:[{id:'punch',action:'punch',start:0,end:1,speed:1}]}},
    ]});
    read=await call('director_read',{sections:[]});
    await call('director_apply',{revision:read.revision,requestId:'joint-desktop-setup',operations:[{operation:'update',id:'physics-human',patch:{pose:{hips:[0,5,0],rightElbow:[-10,15,5],leftAnkle:[10,0,0]}}}]});
    await call('director_view',{entityId:'physics-human',time:.3});
    await page.locator('[data-inspect="actions"]').click();
    await page.locator('#pose-joint-choice').selectOption('rightElbow');
    const elbowY=page.locator('[data-pose-joint="rightElbow"][data-pose-axis="2"]');
    assert.equal(await elbowY.inputValue(),'15'); await elbowY.fill('30'); await elbowY.blur();
    read=await call('director_read',{sections:['entities'],ids:['physics-human'],details:true});assert.equal(read.entities[0].pose.rightElbow[1],30);
    await call('director_history',{action:'undo',revision:read.revision});
    read=await call('director_read',{sections:['entities'],ids:['physics-human'],details:true});assert.equal(read.entities[0].pose.rightElbow[1],15);
    const report=await call('director_spatial',{time:4});const prop=report.objects.find(o=>o.entityId==='physics-prop'),human=report.objects.find(o=>o.entityId==='physics-human');assert.ok(Math.abs(prop.origin[1])<.05);assert.equal(human.physics.active,true);assert.ok(human.physics.bodies>10);
    await call('director_view',{entityId:'physics-human',time:4});await page.locator('[data-inspect="physics"]').click();assert.equal(await page.locator('[data-physics="ragdoll"]').isChecked(),true);
    read=await call('director_read',{sections:['scene','entities'],ids:['physics-human'],details:true});assert.equal(read.physics.enabled,true);assert.equal(read.entities[0].physics.ragdoll,true);
    const skill=await call('director_skill',{path:'references/physics.md'});assert.match(skill.instructions,/通用物理/);
    await page.locator('[data-physics="mass"]').fill('75');await page.locator('[data-physics="mass"]').blur();read=await call('director_read',{sections:['entities'],ids:['physics-human'],details:true});assert.equal(read.entities[0].physics.mass,75);
    await call('director_history',{action:'undo',revision:read.revision});read=await call('director_read',{sections:['entities'],ids:['physics-human'],details:true});assert.equal(read.entities[0].physics.mass,60);
    await page.screenshot({path:'tmp/physics/desktop.png'});assert.deepEqual(errors,[]);
    console.log('Isolated Electron: real MCP XYZ pose/physics edits, bundled skill, inspectors, undo passed.');
}finally{await client.close().catch(()=>{});await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}
