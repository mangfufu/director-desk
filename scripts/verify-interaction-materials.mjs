import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
const output='tmp/blender-import/interaction';await fs.mkdir(output,{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:0,hmr:false}});await server.listen();
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);await page.waitForFunction(()=>window.__director);
 await page.evaluate(async()=>{
  const T=await import('/node_modules/three/build/three.module.js'),{createScene}=await import('/src/scenes.ts'),{entity}=await import('/src/model.ts');
  const {defaultLighting,defaultLight}=await import('/src/lighting/model.ts');
  const api=window.__director,p=createScene('blank');p.room.enabled=false;p.entities=p.entities.filter(e=>e.camera);p.entities[0].position=[9,8,15];p.entities[0].camera.target=[0,0,0];
  for(let i=0;i<420;i++){const e=entity('prop','cube','Box '+i,[(i%21-10)*.5,.25,Math.floor(i/21)*.5-5]);e.scale=[.35,.5,.35];p.entities.push(e);}
  for(let i=0;i<3;i++){const l=entity('prop','light-point','Light '+i,[(i-1)*4,5,0]);l.light={...defaultLight('light-point'),intensity:80};p.entities.push(l);}
  p.lighting={...defaultLighting(),quality:'low'};api.replaceProject(p);
  const texture=new T.DataTexture(new Uint8Array([170,80,30,255]),1,1);texture.needsUpdate=true;texture.colorSpace=T.SRGBColorSpace;
  const e=api.getEngine();for(const entity of p.entities.filter(x=>x.asset==='cube'||x.name.startsWith('Box ')))e.models.get(entity.id)?.traverse(n=>{if(n.isMesh)for(const m of Array.isArray(n.material)?n.material:[n.material]){m.map=texture;m.needsUpdate=true;}});
  e.interactionMaterials.clear();e.render();
 });
 await page.waitForFunction(()=>{const e=window.__director.getEngine();return e.interactionMaterials.ready(e.editorRenderer)&&e.interactionMaterials.ready(e.shotRenderer);},{},{timeout:60000});
 const result=await page.evaluate(()=>{
  const e=window.__director.getEngine(),originals=new Map();e.scene.traverse(n=>{if(n.isMesh)originals.set(n,n.material);});
  let simplified=false,outputSimplified=false,output=false;
  const renderer=e.shotRenderer,render=renderer.render;
  renderer.render=function(scene,camera){scene.traverse(n=>{if(n.isMesh && (Array.isArray(n.material)?n.material:[n.material]).some(m=>m.type==='MeshLambertMaterial'&&m.map)){if(output)outputSimplified=true;else simplified=true;}});return render.call(this,scene,camera);};
  const restore=()=>[...originals].every(([n,m])=>n.material===m);
  e.updateInteractionPreview(true);e.render();const firstFrameDraft=e.draftPreview,materialsRestored=restore();
  e.updateInteractionPreview(false);e.render();
  const image=()=>[e.editorRenderer.domElement.toDataURL(),e.shotRenderer.domElement.toDataURL()];
  const released=image();e.shadowCache.clear();e.render();const releaseParity=JSON.stringify(released)===JSON.stringify(image());
  e.updateInteractionPreview(true);e.exporting=true;output=true;e.renderOutput(0,640,360,'program',null);output=false;e.exporting=false;
  e.updateInteractionPreview(false);e.adaptivePreview=false;e.updateInteractionPreview(true);e.render();const opted=image();e.shadowCache.clear();e.render();const optOutParity=JSON.stringify(opted)===JSON.stringify(image());
  renderer.render=render;return {simplified,firstFrameDraft,materialsRestored,releaseParity,outputSimplified,optOutParity,finalMaterialsRestored:restore()};
 });
 assert.deepEqual(errors,[]);assert.equal(result.outputSimplified,false);
 for(const key of ['simplified','firstFrameDraft','materialsRestored','releaseParity','optOutParity','finalMaterialsRestored'])assert.equal(result[key],true,key);
 // Exercise the real frame loop: viewport gestures and playback must activate
 // adaptive preview, and editor-only navigation must not redraw the shot view.
 await page.evaluate(()=>{const e=window.__director.getEngine();e.adaptivePreview=true;e.updateInteractionPreview(false);e.render();});
 const rect=await page.locator('#stage-canvas canvas').boundingBox();assert.ok(rect);
 const x=rect.x+rect.width*.5,y=rect.y+rect.height*.5;
 await page.mouse.move(x,y);await page.mouse.down({button:'right'});
 await page.mouse.move(x+20,y+10,{steps:3});
 await page.waitForFunction(()=>window.__director.getEngine().draftPreview);
 const shotFrame=await page.evaluate(()=>window.__director.getEngine().shotRenderer.info.render.frame);
 await page.mouse.move(x+90,y+25,{steps:8});
 assert.equal(await page.evaluate(()=>window.__director.getEngine().shotRenderer.info.render.frame),shotFrame,'orbit does not redraw the unchanged camera view');
 await page.mouse.up({button:'right'});
 await page.waitForFunction(()=>!window.__director.getEngine().draftPreview,null,{timeout:10000});
 await page.locator('[data-act="play"]').click();
 await page.waitForFunction(()=>{const e=window.__director.getEngine();return e.time>.1&&e.draftPreview&&e.continuousPreview;});
 await page.locator('[data-act="play"]').click();
 await page.waitForFunction(()=>!window.__director.getEngine().draftPreview);
 result.orbitAndPlayback=true;
 assert.deepEqual(errors,[]);
 await fs.writeFile(output+'/result.json',JSON.stringify(result,null,2));await page.screenshot({path:output+'/scene.png'});console.log('PASS',result);
}finally{await browser.close();await server.close();}
