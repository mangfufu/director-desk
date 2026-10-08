import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
await fs.mkdir('tmp/physics',{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:0,watch:null}});await server.listen();
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
    const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);await page.waitForFunction(()=>window.__director);
    await page.evaluate(async()=>{
        const {createScene}=await import('/src/scenes.ts'),{entity,clip}=await import('/src/model.ts'),{defaultPhysicsBody,defaultPhysicsWorld}=await import('/src/physics/model.ts');
        const p=createScene('blank');p.duration=6;p.physics=defaultPhysicsWorld();
        const human=entity('actor','human-adult','布娃娃人物',[-1,0,0]);human.id='ragdoll';human.clips=[clip('run',0,2)];human.path={smooth:false,points:[{time:0,position:[-1,0,0]},{time:2,position:[-1,0,1.5]}]};
        const box=entity('prop','cube','掉落物',[1,3,0]);box.id='drop';box.physics={...defaultPhysicsBody(),shape:'box'};
        p.entities.push(human,box);const camera=p.entities.find(e=>e.camera);camera.position=[6,5,9];camera.camera.target=[0,1,0];camera.camera.focal=30;
        window.__director.replaceProject(p);await window.__director.callTool('director_view',{entityId:'ragdoll',time:0});
    });
    await page.locator('[data-inspect="physics"]').click();await page.locator('[data-physics="enabled"]').check();
    await page.locator('[data-physics="start"]').fill('1');await page.locator('[data-physics="start"]').blur();
    await page.locator('[data-physics="ragdoll"]').check();await page.locator('[data-physics-event-add]').click();
    await page.locator('[data-physics="impulse"][data-axis="2"]').fill('90');await page.locator('[data-physics="impulse"][data-axis="2"]').blur();
    let p=await page.evaluate(()=>window.__director.getProject());assert.equal(p.entities.find(e=>e.id==='ragdoll').physics.start,1);assert.equal(p.entities.find(e=>e.id==='ragdoll').physics.impulses[0].impulse[2],90);
    const result=await page.evaluate(()=>{
        const api=window.__director,engine=api.getEngine(),start=performance.now();api.setTime(4);
        const firstMs=performance.now()-start,state=()=>[...engine.models.get('ragdoll').matrixWorld.elements,...engine.rigs.get('ragdoll').hips.matrixWorld.elements,...engine.models.get('drop').matrixWorld.elements];
        const before=state(),cached=performance.now();for(let i=0;i<60;i++){api.setTime(1+i/30);}const cachedMs=(performance.now()-cached)/60;
        api.setTime(4);const after=state();return {firstMs,cachedMs,before,after,y:engine.models.get('drop').position.y,hips:engine.rigs.get('ragdoll').hips.getWorldPosition(engine.proxy.position.clone()).toArray()};
    });
    assert.deepEqual(result.before,result.after);assert.ok(Math.abs(result.y)<.05);assert.ok(result.hips[1]<1);console.log('Physics timings',JSON.stringify({firstMs:result.firstMs,cachedMs:result.cachedMs}));
    const offset=await page.evaluate(()=>{const engine=window.__director.getEngine();return engine.proxy.position.distanceTo(engine.models.get('ragdoll').getWorldPosition(engine.proxy.position.clone()));});assert.ok(offset<1e-8,'gizmo follows the physical body rather than its old path');
    await page.screenshot({path:'tmp/physics/physics-panel.png'});
    for(const width of [1024,1440]){await page.setViewportSize({width,height:900});assert.equal(await page.locator('#inspector-content').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);}
    const undo=async()=>{await page.locator('[data-menu="edit"]').click();await page.locator('[data-act="undo"]').click();};
    await undo();p=await page.evaluate(()=>window.__director.getProject());assert.equal(p.entities.find(e=>e.id==='ragdoll').physics.impulses[0].impulse[2],0);
    await page.evaluate(async()=>{const api=window.__director;api.replaceProject(JSON.parse(JSON.stringify(api.getDocument())));const read=await api.callTool('director_read',{sections:['scene','entities'],ids:['ragdoll'],details:true});if(!read.ok)throw Error(read.error);if(!read.data.physics.enabled)throw Error('world physics not saved');if(!read.data.entities[0].physics.ragdoll)throw Error('ragdoll not saved');});
    const bytes=await page.evaluate(()=>window.__director.exportForTest({width:640,height:360,fps:24,cameraId:'program',monochrome:false,start:0,end:2,format:'mp4'}));assert.ok(bytes.length>10000);await fs.writeFile('tmp/physics/output.mp4',Buffer.from(bytes));
    const imported=await fs.readFile('test-assets/external/CesiumMan/CesiumMan.glb');
    const pose=await page.evaluate(async data=>{
        const {packModelFiles}=await import('/src/resources/model-package.ts'),{modelResourceId}=await import('/src/resources/project-resources.ts'),{entity,clip}=await import('/src/model.ts'),{defaultPhysicsBody}=await import('/src/physics/model.ts');
        const p=window.__director.getProject(),bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0)),pack=packModelFiles('test.glb',[{path:'test.glb',bytes}]),id=await modelResourceId(pack);
        p.version=2;p.resources=[{id,package:pack,name:'公开测试人形',source:'KhronosGroup glTF-Sample-Assets / CesiumMan',license:'CC BY 4.0',copyright:'Cesium'}];
        const actor=entity('actor','external-model','导入人形',[0,0,0]);actor.id='imported';actor.external={resourceId:id,appearance:'white',unitScale:1,orientation:[0,0,0],rig:{version:1,family:'humanoid',bones:{hips:'0/0',spine:'0/0/0',head:'0/0/0/0',
            leftUpperArm:'0/0/0/1',leftLowerArm:'0/0/0/1/0',leftHand:'0/0/0/1/0/0',rightUpperArm:'0/0/0/2',rightLowerArm:'0/0/0/2/0',rightHand:'0/0/0/2/0/0',leftUpperLeg:'0/0/1',leftLowerLeg:'0/0/1/0',leftFoot:'0/0/1/0/0',rightUpperLeg:'0/0/2',rightLowerLeg:'0/0/2/0',rightFoot:'0/0/2/0/0'}}};
        const engine=window.__director.getEngine();await engine.externalModels.prepare(p);actor.external.rig=engine.externalModels.inspection(p.resources[0]).rigSuggestion.rig;
        actor.clips=[clip('punch',0,1)];actor.physics={...defaultPhysicsBody(),mass:60,ragdoll:true,start:1,impulses:[{time:1,impulse:[60,30,0],point:[0,0,0]}]};p.entities.push(actor);
        await engine.externalModels.prepare(p);window.__director.replaceProject(p);window.__director.setTime(4);
        const bones=()=>Object.values(engine.externalModels.physicsBones(actor)).flatMap(n=>n.matrixWorld.toArray()),a=bones();window.__director.setTime(.5);window.__director.setTime(4);return {a,b:bones(),bodyCount:engine.physics.state('imported').bodies};
    },imported.toString('base64'));
    assert.deepEqual(pose.a,pose.b);assert.ok(pose.a.every(Number.isFinite));assert.ok(pose.bodyCount>10);
    await page.evaluate(async()=>{await window.__director.callTool('director_view',{entityId:'imported',time:.5});});await page.locator('[data-inspect="actions"]').click();assert.ok(await page.locator('[data-action-choice] option[value="punch"]').count()||await page.locator('[data-add-action="punch"]').count());
    await page.evaluate(async()=>{
        const {createScene}=await import('/src/scenes.ts'),{entity,clip}=await import('/src/model.ts');
        const p=createScene('blank');p.aspect='16:9';p.duration=5;
        for(const [i,asset] of ['human-adult','human-female','human-muscular','human-dwarf'].entries()){
            const e=entity('actor',asset,asset,[-3+i*2,0,0]);e.color=['#C6C6C6','#909090','#B0B0B0','#DEDEDE'][i];e.clips=[clip(['punch','kick','guard','dodge'][i],0,3)];p.entities.push(e);
        }
        const camera=p.entities.find(e=>e.camera);camera.position=[5,3,11];camera.camera.target=[0,1,0];camera.camera.focal=40;
        window.__director.replaceProject(p);window.__director.setTime(1.4);
    });
    await page.screenshot({path:'tmp/physics/human-models.png'});
    assert.deepEqual(errors,[]);console.log('Physics UI, undo, document reopen, cached seeking, imported humanoid and MP4 export passed.');
}finally{await browser.close();await server.close();}
