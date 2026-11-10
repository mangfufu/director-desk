import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';

const output='output/playwright/motion-calibration';await fs.mkdir(output,{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:0}});await server.listen();
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);await page.waitForFunction(()=>window.__director);
 const fixtures=[
  '/test-assets/external/CesiumMan/CesiumMan.glb',
  '/test-assets/external/quaternius-animations/library-2/Universal Animation Library 2 [Standard]/Unreal-Godot/UAL2_Standard.glb',
 ];
 for(const path of fixtures){
  const result=await page.evaluate(async path=>{
   const {importMotionFile,motionFromSource}=await import('/src/animation/import-user-motion.ts');
   const {MotionPreview}=await import('/src/animation/motion-preview.ts');
   const {createScene}=await import('/src/scenes.ts'),{entity}=await import('/src/model.ts');
   const {insertUserMotion,includeUserMotionResource}=await import('/src/animation/user-motion.ts');
   const bytes=new Uint8Array(await(await fetch(path)).arrayBuffer()),asset=await importMotionFile('motion.glb',[{path:'motion.glb',bytes}]);
   const info=asset.model.inspection,index=info.animations.find(a=>a.name==='Walk_Carry_Loop')?.index??info.animations.find(a=>a.duration>0&&!/pose/i.test(a.name)).index;
   const m=motionFromSource(asset.resource,info,index);m.data.orientation[1]=Math.PI/6;m.data.grounding={mode:'preventPenetration',maxCorrection:.2};
   const host=document.createElement('div');host.style.cssText='position:fixed;inset:60px 320px 200px 260px;z-index:10000;background:#151515';document.body.append(host);
   let preview;
   try{
    preview=new MotionPreview(host,asset.model,m,'human');preview.playing=false;
    const p=createScene('blank'),actor=entity('actor','human-adult','校正测试');p.entities.push(actor);
    includeUserMotionResource(p,{motion:m,resource:asset.resource});insertUserMotion(p,actor.id,m,0);
    const api=window.__director,engine=api.getEngine();await engine.externalModels.prepare(p);api.replaceProject(p);
    const pose=rig=>[rig.hips,...Object.values(rig.joints)].flatMap(n=>[...n.position.toArray(),...n.quaternion.toArray()]);
    const samples=[],saved=JSON.stringify(api.getDocument());
    for(const time of [.1,m.duration*.4,m.duration*.8,.1]){
     preview.seek(time);engine.sample(time);const a=pose(preview.human),b=pose(engine.rigs.get(actor.id));
     samples.push({time,error:Math.max(...a.map((v,i)=>Math.abs(v-b[i]))),pose:a,state:preview.state()});
    }
    engine.exporting=true;await engine.prepareOutput(m.duration*.4);engine.renderOutput(m.duration*.4,640,360);
    preview.seek(m.duration*.4);const exported=pose(engine.rigs.get(actor.id)),shown=pose(preview.human);
    const exportError=Math.max(...exported.map((v,i)=>Math.abs(v-shown[i])));engine.restorePreview(0);
    const unchanged=saved===JSON.stringify(api.getDocument());
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const frameBefore=preview.renderer.info.render.frame,originalSample=preview.runtime.sample;let pausedSamples=0;
    preview.runtime.sample=function(...args){pausedSamples++;return originalSample.apply(this,args);};
    await new Promise(resolve=>setTimeout(resolve,150));
    const pausedFrames=preview.renderer.info.render.frame-frameBefore;preview.runtime.sample=originalSample;
    preview.dispose();preview=undefined;
    // Stored distance-based playback must not freeze a library-only preview or mutate its settings.
    const distance=structuredClone(m);distance.data.loop=true;distance.data.locomotion={mode:'distance',cycleDistance:1};
    const before=JSON.stringify(distance);preview=new MotionPreview(host,asset.model,distance,'human');preview.playing=false;
    preview.seek(.05);const a=pose(preview.human);preview.seek(distance.duration*.5);const b=pose(preview.human);
    const moving=a.some((v,i)=>Math.abs(v-b[i])>1e-5),kept=before===JSON.stringify(distance);preview.dispose();preview=undefined;
    // Source framing uses all source bones even when the user has not mapped any yet.
    const unmapped=structuredClone(m);unmapped.data.rig.bones={};delete unmapped.data.motion;
    preview=new MotionPreview(host,asset.model,unmapped,'source');preview.playing=false;preview.seek(0);preview.frameAll();
    preview.camera.updateMatrixWorld(true);
    const projected=info.bones.map(b=>preview.instance.nodePosition(b.path).project(preview.camera));
    const framed=projected.filter(p=>Math.abs(p.x)<1&&Math.abs(p.y)<1&&p.z>-1&&p.z<1).length/projected.length;
    return {name:asset.resource.name,mapped:info.rigSuggestion.complete,samples,exportError,unchanged,moving,kept,framed,pausedSamples,pausedFrames};
   }finally{preview?.dispose();host.remove();asset.model.dispose();}
  },path);
  assert.equal(result.mapped,true);assert.ok(result.samples.every(s=>s.error<1e-6),JSON.stringify(result.samples.map(s=>({time:s.time,error:s.error}))));
  assert.deepEqual(result.samples[0].pose,result.samples.at(-1).pose);assert.ok(result.exportError<1e-6);
  assert.equal(result.unchanged,true);assert.equal(result.moving,true);assert.equal(result.kept,true);assert.ok(result.framed>.95);
  assert.equal(result.pausedSamples,0);assert.equal(result.pausedFrames,0);
  console.log('PASS:',path.split('/').at(-1),'preview/scene/export pose match, repeatable seeks, distance preview, unmapped framing');
 }
 assert.deepEqual(errors,[]);
}finally{await browser.close();await server.close();}
