import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { _electron as electron } from 'playwright-core';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const profile=await fs.mkdtemp(path.resolve('tmp/review/extensions-'));
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
let app,client,page;const errors=[];
async function launch(){
    app=await electron.launch({executablePath:createRequire(import.meta.url)('electron'),args:[path.resolve('.audit/desktop-app'),`--director-test-profile=${profile}`],env});
    page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
    page.on('console',msg=>{if(msg.type()==='error')console.log('renderer:',msg.text());});
    await page.waitForFunction(()=>window.directorDesktop);
    const state=await page.evaluate(()=>window.directorDesktop.mcp());
    const connection=JSON.parse(await fs.readFile(path.join(profile,'mcp-connection.json'),'utf8'));
    const token=await app.evaluate(({safeStorage},secret)=>safeStorage.decryptString(Buffer.from(secret,'base64')),connection.secret);
    client=new Client({name:'extensions-test',version:'1'});
    await client.connect(new StreamableHTTPClientTransport(new URL(state.data.url),{requestInit:{headers:{Authorization:`Bearer ${token}`}}}));
    for(let i=0;i<100;i++){const r=await raw('director_read',{sections:[]});if(r.ok)return;await new Promise(r=>setTimeout(r,100));}
    throw Error('renderer not ready');
}
async function close(){await client?.close().catch(()=>{});await app?.evaluate(({app})=>app.exit(0)).catch(()=>{});await app?.close().catch(()=>{});}
async function raw(name,args={}){return JSON.parse((await client.callTool({name,arguments:args})).content.find(c=>c.type==='text').text);}
async function call(name,args={}){const r=await raw(name,args);assert.equal(r.ok,true,`${name}: ${r.error}`);return r.data;}
async function write(name,args){const {revision}=await call('director_read',{sections:[]});return call(name,{...args,...(['director_settings','director_export'].includes(name)?{}:{revision}),requestId:crypto.randomUUID()});}
async function job(ref){for(let i=0;i<600;i++){const r=await call('director_job',{id:ref.jobId});if(r.status!=='running'){assert.equal(r.status,'completed',r.error);return r.result;}await new Promise(r=>setTimeout(r,100));}throw Error('job timeout');}
try{
    await launch();
    await write('director_scene',{action:'new-project',template:'blank',name:'Extensions test'});
    await write('director_settings',{scope:'files',action:'set',patch:{projects:path.join(profile,'outputs'),exports:path.join(profile,'outputs')}});
    const obj=path.join(profile,'source.obj');await fs.writeFile(obj,'v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n');
    await job(await write('director_import',{kind:'model',path:obj,position:[20,0,0]}));
    await write('director_apply',{operations:[
        {operation:'add',asset:'crowd',id:'extras',position:[-4,0,0],patch:{count:4,spacing:1.5}},
        {operation:'add',asset:'shape-box',id:'obstacle',position:[0,1,0],patch:{scale:[1,2,1]}},
    ]});
    const saved=await write('director_versions',{action:'save',name:'Before navigation'});
    const secondVersion=await write('director_versions',{action:'save',name:'Same sources'});
    async function storedSourceCount(){return page.evaluate(()=>new Promise((resolve,reject)=>{const request=indexedDB.open('director-project-versions-v1',1);request.onsuccess=()=>{const db=request.result,tx=db.transaction('sources'),r=tx.objectStore('sources').count();r.onsuccess=()=>resolve(r.result);tx.oncomplete=()=>db.close();};request.onerror=()=>reject(request.error);}));}
    assert.equal(await storedSourceCount(),1,'version source packages are deduplicated');
    await call('director_view',{entityId:'extras',time:0});
    await page.locator('[data-menu="scene"]').click();await page.locator('[data-act="navigate-open"]').first().click();
    await page.locator('.navigation-panel').waitFor();
    await page.locator('#nav-0').fill('4');await page.locator('#nav-1').fill('0');await page.locator('#nav-2').fill('0');await page.locator('#nav-end').fill('25');
    await page.screenshot({path:path.join(profile,'navigation.png')});
    await page.locator('[data-act="navigate-generate"]').click();await page.locator('.navigation-panel').waitFor({state:'hidden'});
    assert.equal((await call('director_read',{ids:['extras'],details:true})).entities[0].memberPaths.length,4,'UI generated routes');
    const nav=await job(await write('director_navigate',{entityIds:['extras'],destination:[4,0,0],start:0,end:25,radius:.35,speed:1.5}));
    assert.equal(nav.people,4);
    const routed=await call('director_read',{ids:['extras'],details:true});assert.equal(routed.entities[0].memberPaths.length,4);
    const cancel=await write('director_navigate',{entityIds:['extras'],destination:[-4,0,8],start:0,end:25,radius:.35,speed:1.5});
    await call('director_job',{id:cancel.jobId,cancel:true});
    for(let i=0;i<100;i++){const r=await call('director_job',{id:cancel.jobId});if(r.status!=='running'){assert.equal(r.status,'canceled');break;}await new Promise(r=>setTimeout(r,50));}
    assert.deepEqual((await call('director_read',{ids:['extras'],details:true})).entities,routed.entities,'canceled route does not modify the scene');
    const positions=[];
    for(const time of [0,3,8,3]){const report=await call('director_spatial',{ids:['extras'],time});positions.push(report);}
    assert.deepEqual(positions[1],positions[3]);assert.notDeepEqual(positions[0],positions[2]);
    for(const kind of ['video','depth-video']){
        const video=await job(await write('director_export',{kind,filename:`routes-${kind}.mp4`,format:'mp4',size:640,fps:24,start:2,end:2.5}));
        assert.ok((await fs.stat(video.files[0].path)).size>1000,`${kind} output is written`);
    }
    const restore=await write('director_versions',{action:'restore',id:saved.id});
    assert.equal((await call('director_read',{ids:['extras'],details:true})).entities[0].memberPaths,undefined);
    await call('director_history',{action:'undo',revision:restore.revision});
    assert.equal((await call('director_read',{ids:['extras'],details:true})).entities[0].memberPaths.length,4);
    const plugin={id:'curve-lab'};
    await write('director_plugins',{action:'import',path:path.resolve('examples/plugins/curve-lab')});
    assert.equal((await call('director_plugins',{action:'read',id:plugin.id})).enabled,false);
    await write('director_plugins',{action:'enable',id:plugin.id,enabled:true});
    await write('director_plugins',{action:'run',id:plugin.id,command:'generate',input:{height:1,speed:2}});
    const extensionData=(await call('director_read',{sections:['scene']})).extensions[plugin.id];assert.equal(extensionData.points.length,160);
    await call('director_history',{action:'undo',revision:(await call('director_read',{sections:[]})).revision});
    assert.equal((await call('director_read',{sections:['scene']})).extensions?.[plugin.id],undefined);
    await call('director_history',{action:'redo',revision:(await call('director_read',{sections:[]})).revision});
    assert.deepEqual((await call('director_read',{sections:['scene']})).extensions[plugin.id],extensionData);
    const stats=await write('director_plugins',{action:'run',id:plugin.id,command:'statistics',input:{}});assert.equal(stats.points,160);
    await write('director_plugins',{action:'run',id:plugin.id,command:'open',input:{}});
    await page.locator('.extension-custom-panel').waitFor();
    await page.screenshot({path:path.join(profile,'custom-panel.png')});
    await page.locator('.extension-custom-panel > header button').click();
    const probeFile=path.join(profile,'probe.ddplugin');
    const probe={format:'director-plugin',apiVersion:2,id:'sdk-probe',name:'SDK probe',version:'1',entry:'index.js',backend:'backend.cjs',permissions:['editor','native'],commands:[{id:'inspect',label:'Inspect'},{id:'crash',label:'Crash'}],files:{
        'index.js':{encoding:'utf8',data:`export function activate(api){
            api.commands.register('inspect',async()=>{const root=api.experimental.engine.scene.getObjectByName('Curve Lab');return {backend:await api.backend.call('inspect'),service:!!api.services.get('curve-lab','curve'),count:root.children[0].count,positions:Array.from(root.children[0].instanceMatrix.array.slice(0,32))};});
            api.commands.register('crash',()=>api.backend.call('crash'));
        }`},
        'backend.cjs':{encoding:'utf8',data:`exports.activate=async api=>({inspect:()=>api.callTool('director_read',{sections:[]}),crash:()=>process.exit(1)});`}
    }};
    await fs.writeFile(probeFile,JSON.stringify(probe));await write('director_plugins',{action:'import',path:probeFile});await write('director_plugins',{action:'enable',id:probe.id,enabled:true});
    const probeAt=async time=>{await call('director_view',{time});return write('director_plugins',{action:'run',id:probe.id,command:'inspect',input:{}});};
    const at0=await probeAt(0),at2=await probeAt(2),again=await probeAt(0);
    assert.equal(at0.count,160);assert.equal(at0.service,true);assert.ok(at0.backend.revision);
    assert.notDeepEqual(at0.positions,at2.positions);assert.deepEqual(at0.positions,again.positions);
    const crashed=await raw('director_plugins',{action:'run',id:probe.id,command:'crash',revision:(await call('director_read',{sections:[]})).revision,requestId:crypto.randomUUID()});assert.equal(crashed.ok,false);assert.match(crashed.error,/退出|停止/);
    assert.equal((await probeAt(0)).service,true,'a backend restarts after crashing without stopping the editor');
    await write('director_plugins',{action:'remove',id:probe.id});
    for(const kind of ['video','depth-video']){
        const output=await job(await write('director_export',{kind,start:0,end:.5,size:640,filename:`extension-${kind}.mp4`}));assert.ok((await fs.stat(output.files[0].path)).size>1000);
    }
    await page.locator('[data-menu="extensions"]').click();await page.locator('[data-act="plugins-open"]').click();
    await page.locator('.plugins-panel').waitFor();await page.screenshot({path:path.join(profile,'plugins.png')});
    const toggle=page.getByRole('switch',{name:'启用插件'});
    const switchBox=await toggle.boundingBox();assert.equal(switchBox.width,42);assert.equal(switchBox.height,24);
    assert.equal(await toggle.getAttribute('aria-checked'),'true');
    assert.doesNotMatch(await page.locator('#plugin-choice').textContent(),/已停用|已启用/);
    await toggle.click();await page.waitForFunction(()=>document.querySelector('[data-act="plugins-toggle"]')?.getAttribute('aria-checked')==='false');
    assert.equal(await page.locator('[data-act="plugins-run"]').isDisabled(),true);
    assert.equal((await call('director_plugins',{action:'read',id:plugin.id})).enabled,false);
    assert.equal(await page.locator('.extension-custom-panel').count(),0);
    assert.equal(await page.locator('.key-tools button').filter({hasText:'打开曲线画布'}).count(),0);
    await toggle.press('Space');await page.waitForFunction(()=>document.querySelector('[data-act="plugins-toggle"]')?.getAttribute('aria-checked')==='true');
    assert.equal(await page.locator('[data-act="plugins-run"]').isEnabled(),true);
    assert.equal((await call('director_plugins',{action:'read',id:plugin.id})).enabled,true);
    await page.locator('[data-act="close-modal"]').last().click();
    await page.locator('[data-menu="file"]').click();await page.locator('[data-act="versions-open"]').click();
    await page.locator('.versions-panel').waitFor();await page.screenshot({path:path.join(profile,'versions.png')});
    await page.locator('[data-act="close-modal"]').last().click();
    const output=await job(await write('director_export',{kind:'project',filename:'persistent.director'}));
    const projectFile=output.files[0].path;
    await close();await launch();
    await job(await write('director_import',{kind:'project',path:projectFile}));
    assert.ok((await call('director_versions',{action:'list'})).items.some(v=>v.id===saved.id));
    assert.equal((await call('director_plugins',{action:'read',id:plugin.id})).active,true);
    assert.deepEqual((await call('director_read',{sections:['scene']})).extensions[plugin.id],extensionData);
    await write('director_plugins',{action:'remove',id:plugin.id});
    assert.equal((await call('director_plugins',{action:'list'})).items.length,0);
    assert.deepEqual((await call('director_read',{sections:['scene']})).extensions[plugin.id],extensionData,'uninstall retains project data');
    await write('director_versions',{action:'rename',id:saved.id,name:'Renamed'});
    await write('director_versions',{action:'export',id:saved.id});
    await write('director_versions',{action:'remove',id:saved.id});assert.equal(await storedSourceCount(),1);
    await write('director_versions',{action:'remove',id:secondVersion.id});assert.equal((await call('director_versions',{action:'list'})).items.length,0);assert.equal(await storedSourceCount(),0);
    assert.deepEqual(errors,[]);
    console.log('Desktop extensions passed: routing, deterministic sampling, versions restore/undo/restart, custom plugin UI, native backend, persistence, render exports and lifecycle.');
    console.log('Artifacts:',path.relative(process.cwd(),profile));
}finally{await close();}
