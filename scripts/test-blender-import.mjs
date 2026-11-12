import assert from 'node:assert/strict';
import {sampleCamera} from '../src/cinematography/sample-camera.ts';
import {PerspectiveCamera,Vector3} from 'three';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { _electron as electron } from 'playwright-core';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {spawnSync} from 'node:child_process';
import {discover} from '../desktop/blender-import/discovery.cjs';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
await fs.mkdir('tmp/blender-import', { recursive: true });
const profile = await fs.mkdtemp(path.resolve('tmp/blender-import/desktop-'));
const found=await discover(process.env.BLENDER_PATH);assert.ok(found.path,'Install Blender 4.2+ or set BLENDER_PATH');
const source=path.join(profile,'sample.blend');
const generated=spawnSync(found.path,['--background','--factory-startup','--disable-autoexec','--python-exit-code','1','--python',path.resolve('tests/fixtures/blender-scene.py'),'--',source],{windowsHide:true,encoding:'utf8'});
assert.equal(generated.status,0,generated.stderr||generated.stdout);
const sourceBytes=await fs.readFile(source);
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ executablePath: createRequire(import.meta.url)('electron'), args: [path.resolve('.audit/desktop-app'), `--director-test-profile=${profile}`], env });
const client = new Client({ name: 'file-control-test', version: '1' });
try {
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().forEach(w=>w.setPosition(-16000,-16000)));
    assert.equal(path.resolve(await app.evaluate(({ app }) => app.getPath('userData'))), profile);
    await app.evaluate(({ dialog }) => {
        dialog.showOpenDialog = async () => { throw Error('Unexpected open dialog'); };
        dialog.showSaveDialog = async () => { throw Error('Unexpected save dialog'); };
    });
    const page = await app.firstWindow(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.waitForFunction(() => window.directorDesktop);
    const started = await page.evaluate(() => window.directorDesktop.mcp()); assert.equal(started.ok, true);
    assert.equal(started.data.enabled, true, 'MCP starts automatically without opening its panel');
    const connection = JSON.parse(await fs.readFile(path.join(profile, 'mcp-connection.json'), 'utf8'));
    const token = await app.evaluate(({ safeStorage }, secret) => safeStorage.decryptString(Buffer.from(secret, 'base64')), connection.secret);
    await client.connect(new StreamableHTTPClientTransport(new URL(started.data.url), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
    const raw = async (name, args) => JSON.parse((await client.callTool({ name, arguments: args })).content.find(c => c.type === 'text').text);
    async function call(name, args = {}) { const r = await raw(name, args); assert.equal(r.ok, true, `${name}: ${r.error}`); return r.data; }
    let read;
    for (let i = 0; i < 150; i++) {
        const r = await raw('director_read', { sections: [] });
        if (r.ok) { read = r.data; break; }
        assert.match(r.error, /尚未连接或正在重新载入/); await new Promise(r => setTimeout(r, 100));
    }
    assert.ok(read, 'renderer ready');
    async function finish(ref) {
        for (let i = 0; i < 600; i++) {
            const j = await call('director_job', { id: ref.jobId });
            if (j.status !== 'running') { assert.equal(j.status, 'completed', j.error); return j.result; }
            await new Promise(r => setTimeout(r, 100));
        }
        throw Error('job timed out');
    }

    const originalCount=read.entityCount,originalName=read.name;
    const args={kind:'blender',path:source,mode:'open',revision:read.revision,requestId:'blender-open'};
    const job=await call('director_import',args);assert.deepEqual(await call('director_import',args),job);
    const imported=await finish(job);assert.equal(imported.entityIds.length,8);console.log('IMPORT',imported);
    assert.ok(imported.warnings.some(w=>w.includes('Wire Control')));
    assert.ok(imported.warnings.some(w=>w.includes('Path Control')));
    read=await call('director_read',{sections:['entities','cuts'],details:true});
    await fs.writeFile(path.join(profile,'read.json'),JSON.stringify(read,null,2));
    assert.equal(read.name,'sample');
    const objects=read.entities,model=objects.find(e=>e.name==='Moving Cube'),rig=objects.find(e=>e.name==='Animated Rig');
    assert.ok(model.clips.some(c=>c.action==='native'));assert.ok(rig.clips.some(c=>c.action==='native'));
    assert.equal(objects.find(e=>e.name==='Array Props').clips?.length??0,0,'Static objects have no redundant animation clip');
    const at0=await call('director_spatial',{time:0});const at1=await call('director_spatial',{time:1});
    await fs.writeFile(path.join(profile,'spatial.json'),JSON.stringify({at0,at1},null,2));
    const start=at0.objects.find(o=>o.entityId===model.id),end=at1.objects.find(o=>o.entityId===model.id);
    assert.deepEqual(start.bounds.center,[3,1,-2]);assert.deepEqual(end.bounds.center,[5,1,-2]);
    assert.equal(read.cuts.length,2);assert.equal(read.cuts[1].time,.5);assert.notEqual(read.cuts[0].cameraId,read.cuts[1].cameraId);
    const rig0=at0.objects.find(o=>o.entityId===rig.id),rig1=at1.objects.find(o=>o.entityId===rig.id);assert.notDeepEqual(rig0.bounds,rig1.bounds);
    for(const [name,x] of [['Instance A',8],['Instance B',-8]]){
        const object=objects.find(o=>o.name===name);assert.ok(object,name);
        const first=at0.objects.find(o=>o.entityId===object.id).bounds,last=at1.objects.find(o=>o.entityId===object.id).bounds;
        assert.deepEqual(first.min,[x-.75,0,-2.5]);
        assert.deepEqual(first.max,[x+1,1,-1.5]);
        assert.deepEqual(last.min,[x-.75,0,-4.5]);
        assert.deepEqual(last.max,[x+1,1,-3.5]);
    }
    console.log('PASS empty controls skipped; nested collection instances preserve separate placement and animated parents');
    console.log('PASS world coordinates, sampled skeletal motion, camera cut timing');
    const out=await finish(await call('director_export',{kind:'project',path:path.join(profile,'saved.director'),requestId:'save'}));
    const saved=JSON.parse(await fs.readFile(out.files[0].path,'utf8'));
    assert.ok(!JSON.stringify(saved).includes(source));
    const state=saved.scenes[0].state,expected=JSON.parse(await fs.readFile(path.join(profile,'sample-projection.json'),'utf8'));
    for(const item of expected){const camEntity=state.entities.find(e=>e.name===item.camera),camera=new PerspectiveCamera();sampleCamera(camera,camEntity,state,item.time,{models:new Map(),rigs:new Map()});const actual=new Vector3(...item.point).project(camera);assert.ok(Math.abs(actual.x-item.ndc[0])<1e-5&&Math.abs(actual.y-item.ndc[1])<1e-5,JSON.stringify({item,actual:actual.toArray()}));}
    console.log('PASS 18 projected point comparisons against Blender across cameras, animation, roll and shifted lens');
    read=await call('director_read',{sections:[]});await call('director_history',{action:'undo',revision:read.revision});
    read=await call('director_read',{sections:[]});assert.equal(read.entityCount,originalCount);assert.equal(read.name,originalName);
    await finish(await call('director_import',{kind:'project',path:out.files[0].path,revision:read.revision,requestId:'reopen'}));
    read=await call('director_read',{sections:[]});assert.equal(read.entityCount,8);
    const separate=await finish(await call('director_import',{kind:'blender',path:source,revision:read.revision,requestId:'default-scene'}));
    assert.equal(separate.mode,'scene');
    const separateOut=await finish(await call('director_export',{kind:'project',path:path.join(profile,'separate.director'),requestId:'save-separate'}));
    const separateDoc=JSON.parse(await fs.readFile(separateOut.files[0].path,'utf8'));
    assert.equal(separateDoc.scenes.length,2);assert.deepEqual(separateDoc.scenes[0],saved.scenes[0]);
    assert.equal(separateDoc.activeSceneId,separate.sceneId);assert.equal(separateDoc.scenes[1].state.entities.length,8);
    assert.equal(separateDoc.name,saved.name);
    read=await call('director_read',{sections:[]});await call('director_history',{action:'undo',revision:read.revision});
    read=await call('director_read',{sections:[]});assert.equal(read.entityCount,8);
    console.log('PASS default Blender import creates an independent scene, preserves the old scene, and supports undo');
    const before=read.revision;
    const cancelJob=await call('director_import',{kind:'blender',path:source,revision:before,requestId:'cancel'});
    await call('director_job',{id:cancelJob.jobId,cancel:true});
    for(let i=0;i<200;i++){const state=await call('director_job',{id:cancelJob.jobId});if(state.status!=='running'){assert.equal(state.status,'canceled',state.error);break;}await page.waitForTimeout(50);}
    read=await call('director_read',{sections:[]});assert.equal(read.entityCount,8);assert.equal(read.revision,before);
    await app.evaluate(({dialog},source)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[source]});},source);
    await page.locator('[data-menu="file"]').click();await page.locator('#application-menu-file [data-act="blender-import"]').click();
    await page.waitForFunction(()=>!!document.querySelector('#blend-program')?.value);
    assert.equal(await page.locator('#blend-mode').inputValue(),'scene');await page.locator('#blend-mode').selectOption('merge');
    await page.locator('#blend-choose-source').click();await page.locator('#blend-animation').uncheck();
    await page.locator('#blend-run').click();await page.waitForFunction(()=>!document.querySelector('#blend-cancel')?.disabled&&/导入完成|Import complete/.test(document.querySelector('#blend-status')?.textContent||''),{},{timeout:60000});
    read=await call('director_read',{sections:[]});assert.equal(read.entityCount,16);
    await page.screenshot({animations:'disabled',path:path.join(profile,'ui-completed.png')});
    await page.locator('#blend-cancel').click();
    await page.screenshot({animations:'disabled',path:path.join(profile,'imported-scene.png')});
    await page.evaluate(()=>document.querySelector('#settings-toggle').click());await page.locator('#ui-language').selectOption('en');await page.locator('[data-act="close-modal"]').first().click();
    await page.locator('[data-menu="file"]').click();await page.locator('#application-menu-file [data-act="blender-import"]').click();await page.waitForFunction(()=>!!document.querySelector('#blend-program')?.value);
    assert.equal(await page.locator('.modal-header h2').innerText(),'Import Blender Scene');await page.screenshot({animations:'disabled',path:path.join(profile,'ui-english.png')});await page.locator('#blend-cancel').click();
    assert.deepEqual(await fs.readFile(source),sourceBytes);assert.deepEqual(errors,[]);console.log('PASS real Blender -> MCP, editable objects, native clips, save/reopen, undo, cancellation, UI static merge');
} finally {await client.close().catch(()=>{});await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}
