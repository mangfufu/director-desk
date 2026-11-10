import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
const output='output/playwright/visibility-timeline';await fs.mkdir(output,{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:0}});await server.listen();
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);await page.waitForFunction(()=>window.__director);
 const call=(name,args={})=>page.evaluate(async({name,args})=>{const r=await window.__director.callTool(name,args);if(!r.ok)throw Error(r.error);return r.data;},{name,args});
 const id=await page.evaluate(async()=>{
  const {createScene}=await import('/src/scenes.ts'),{entity}=await import('/src/model.ts');
  const p=createScene('blank'),e=entity('actor','human-adult','显示测试',[0,0,0]);p.duration=8;
  e.clips=[{id:'idle-a',action:'idle',start:0,end:2,speed:1},{id:'walk-b',action:'walk',start:4,end:6,speed:1}];
  p.entities.push(e);p.entities.find(x=>x.camera).position=[0,2,6];p.entities.find(x=>x.camera).camera.target=[0,1,0];
  window.__director.replaceProject(p);return e.id;
 });
 await call('director_view',{entityId:id,time:4});
 const row=()=>page.locator(`[data-track-key="visibility:${id}"]`),bar=()=>row().locator('[data-visibility-id]').last();
 await bar().scrollIntoViewIfNeeded();await bar().click({position:{x:30,y:12}});await page.locator('#timeline-split').click();
 assert.equal(await row().locator('[data-visibility-id]').count(),2);
 await row().locator('[data-visibility-id]').first().click({position:{x:30,y:12}});await page.keyboard.press('Delete');
 const ranges=()=>page.evaluate(id=>window.__director.getProject().entities.find(e=>e.id===id).visibility.map(c=>[c.start,c.end]),id);
 assert.deepEqual(await ranges(),[[4,8]]);
 const handles=await page.evaluate(()=>{const api=window.__director,engine=api.getEngine();return [3,4,8,5].map(time=>{api.setTime(time);return [!!engine.gizmo.object,!!engine.selectionBox?.visible];});});
 assert.deepEqual(handles,[[false,false],[true,true],[false,false],[true,true]]);
 const joints=await page.evaluate(()=>{
  const engine=window.__director.getEngine(),states=[];
  for(const time of [3,4]){engine.sample(time);engine.selectJoint('hips');states.push(!!engine.gizmo.object);engine.selectJoint('');states.push(!!engine.gizmo.object);}
  engine.drawingPath=true;engine.selectJoint('hips');states.push(!!engine.gizmo.object);engine.selectJoint('');states.push(!!engine.gizmo.object);
  engine.drawingPath=false;engine.sample(4);return states;
 });
 assert.deepEqual(joints,[false,false,true,true,false,false]);
 const outputStates=await page.evaluate(async id=>{
  const engine=window.__director.getEngine(),result=[],{collectSpatialReport}=await import('/src/spatial/report.ts');engine.exporting=true;
  try{for(const time of [3,4,7.99,8]){await engine.prepareOutput(time);engine.renderOutput(time,640,360);const report=collectSpatialReport(engine,engine.cameraEntity().id,false);result.push({time,visible:engine.models.get(id).visible,enabled:report.objects.find(x=>x.entityId===id).enabled});}}
  finally{engine.restorePreview(4);}return result;
 },id);
 assert.deepEqual(outputStates.map(x=>[x.visible,x.enabled]),[[false,false],[true,true],[true,true],[false,false]]);
 const pixels=await page.evaluate(async id=>{
  const engine=window.__director.getEngine(),e=engine.project.entities.find(e=>e.id===id),results=[];engine.exporting=true;
  try{for(const depth of [null,{near:0,far:20,invert:false}]){
   const capture=async time=>{await engine.prepareOutput(time);engine.renderOutput(time,640,360,'program',depth);return engine.renderOutput(time,640,360,'program',depth).toDataURL();};
   e.visible=true;const hidden=await capture(3),shown=await capture(4);e.visible=false;
   results.push({hiddenMatches: hidden===await capture(3),shownDiffers:shown!==await capture(4)});
  }}finally{e.visible=true;engine.restorePreview(4);}return results;
 },id);
 assert.deepEqual(pixels,[{hiddenMatches:true,shownDiffers:true},{hiddenMatches:true,shownDiffers:true}]);
 const drag=async(edge,delta,cancel=false)=>{
  const target=edge?bar().locator(`[data-resize="${edge}"]`):bar();await target.scrollIntoViewIfNeeded();const r=await target.boundingBox();
  const x=edge?r.x+r.width/2:r.x+25,y=r.y+r.height/2;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+delta*60,y,{steps:8});
  if(cancel)await page.keyboard.press('Escape');await page.mouse.up();
 };
 await drag('start',-1);assert.deepEqual(await ranges(),[[3,8]]);
 await drag('true',-2);assert.deepEqual(await ranges(),[[3,6]]);
 await drag(null,-1,true);assert.deepEqual(await ranges(),[[3,6]]);assert.equal(await page.locator('.timeline-drag-floating').count(),0);
 await drag(null,-1);assert.deepEqual(await ranges(),[[2,5]]);
 await page.keyboard.press('Control+z');assert.deepEqual(await ranges(),[[3,6]]);
 await call('director_view',{time:4,entityId:id});
 await bar().click({modifiers:['Control'],position:{x:25,y:12}});
 await page.locator('[data-clip-id="walk-b"]').click({modifiers:['Control'],position:{x:25,y:12}});
 const selected=await call('director_read',{sections:['selection']});assert.equal(selected.selection.clips.length,2);
 const before=JSON.stringify(await ranges());
 await page.screenshot({path:`${output}/selected.png`});
 // The time-range editor and MCP use the same persisted schedule.
 const read=await call('director_read',{ids:[id],details:true});const clip=read.entities[0].visibility[0];
 await call('director_apply',{revision:read.revision,requestId:'remove-visibility',operations:[{operation:'timeline',patch:{action:'remove',selection:{kind:'visibility',entityId:id,id:clip.id}}}]});
 assert.deepEqual(await ranges(),[]);await call('director_view',{entityId:id,time:5});await row().locator('[data-add-visibility]').click();
 assert.deepEqual(await ranges(),[[5,6]]);assert.notEqual(JSON.stringify(await ranges()),before);
 const saved=await page.evaluate(()=>window.__director.getDocument());await page.evaluate(doc=>window.__director.replaceProject(JSON.parse(JSON.stringify(doc))),saved);
 await call('director_view',{entityId:id,time:5});assert.deepEqual(await ranges(),[[5,6]]);
 const source=await call('director_read',{sections:[]});
 const continued=await call('director_scene',{action:'continue',revision:source.revision,requestId:'continue-hidden',name:'接拍'});
 assert.ok(continued);
 const following=await call('director_read',{ids:[id],details:true});assert.equal(following.entities[0].visible,false);assert.equal(following.entities[0].visibility,undefined);
 assert.deepEqual(errors,[]);console.log('PASS: visibility split/delete, both edges, drag/cancel/undo, mixed selection, add, save/load, export/spatial boundaries and continuation.');
}finally{await browser.close();await server.close();}
