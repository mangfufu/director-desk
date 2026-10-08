import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Input, BufferSource, ALL_FORMATS, EncodedPacketSink } from 'mediabunny';
import {projectForScene,readSceneDocument} from '../src/scenes/sequence-project.ts';

const base=process.env.DIRECTOR_URL||'http://127.0.0.1:5173';
await fs.mkdir('tmp/smoke',{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const page=await browser.newPage({viewport:{width:1680,height:1050},deviceScaleFactor:1});
const errors=[];page.on('pageerror',error=>{errors.push(error.stack || error.message);console.log('PAGE ERROR',error.stack)});page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text())});
page.on('dialog',dialog=>dialog.accept());
try {
  await page.goto(base,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!!window.__director,{timeout:15000});
  // Pin the editing fixture; the default showcase is intentionally free to evolve.
  await page.evaluate(async()=>{const {demoProject}=await import('/src/model.ts');window.__director.replaceProject(demoProject());});
  await page.locator('#shot-canvas canvas').waitFor();
  await page.screenshot({path:'tmp/smoke/01-workspace.png'});
  console.log('Loaded real 3D scene.');
  const ids=await page.evaluate(()=>{const p=window.__director.getProject();return {actor:p.entities[1].id,camera:p.entities.find(e=>e.name.startsWith('B ·')).id,cuts:p.cuts}});
  await page.locator(`[data-preview="${ids.camera}"]`).click();
  assert.deepEqual(await page.evaluate(()=>window.__director.getProject().cuts),ids.cuts,'Preview must not write a cut');
  const initial=await page.evaluate(()=>{window.__director.setTime(5);return window.__director.signature()});
  const repeat=await page.evaluate(()=>{window.__director.setTime(12);window.__director.setTime(0);window.__director.setTime(5);return window.__director.signature()});
  assert.deepEqual(repeat,initial,'Scrubbing must be deterministic');
  assert.ok(Math.abs(initial.world[14]-(.6+(.15-.6)*2/7))<1e-6);
  const projection=await page.evaluate(()=>{
    const api=window.__director,eng=api.getEngine();const preview=api.signature();eng.exporting=true;eng.renderOutput(5,640,360,preview.cameraId);const output=eng.projectionSignature(preview.cameraId);const pixels=eng.shotRenderer.domElement.toDataURL();eng.restorePreview(5);return {preview,output,pixels};
  });
  assert.deepEqual(projection.preview,projection.output,'Export must use identical world and projection matrices');
  await fs.writeFile('tmp/smoke/02-camera.png',Buffer.from(projection.pixels.split(',')[1],'base64'));
  await page.locator('[data-view="shot"]').click();
  await page.screenshot({path:'tmp/smoke/03-camera-view.png'});
  await page.locator(`[data-select="${ids.actor}"]`).first().click();
  await page.locator('[data-inspect="base"]').click();
  await page.locator('[data-field="height"]').fill('1.85');await page.locator('[data-field="height"]').press('Tab');
  assert.equal(await page.evaluate(id=>window.__director.getProject().entities.find(e=>e.id===id).height,ids.actor),1.85);
  await page.locator('[data-menu="edit"]').click();await page.locator('[data-act="undo"]').click();
  assert.equal(await page.evaluate(id=>window.__director.getProject().entities.find(e=>e.id===id).height,ids.actor),1.75);
  const projectDownload=page.waitForEvent('download');await page.locator('.header-actions [data-act="save"]').click();const saved=await projectDownload;await saved.saveAs(path.resolve('tmp/smoke/roundtrip.director'));
  const savedProject=projectForScene(readSceneDocument(JSON.parse(await fs.readFile('tmp/smoke/roundtrip.director','utf8'))));assert.equal(savedProject.entities.length,14);
  await page.locator('#project-file').setInputFiles(path.resolve('tmp/smoke/roundtrip.director'));
  assert.deepEqual(await page.evaluate(()=>window.__director.getProject()),savedProject);
  await page.locator('.header-actions [data-act="export"]').click();await page.locator('#export-end').fill('0.5');await page.locator('#export-size').selectOption('640');await page.locator('#export-camera').selectOption(ids.camera);await page.screenshot({path:'tmp/smoke/04-export.png'});
  await page.locator('#export-save').selectOption('download');
  const videoDownload=page.waitForEvent('download',{timeout:120000});await page.locator('[data-act="export-start"]').click();const video=await videoDownload;await video.saveAs(path.resolve('tmp/smoke/reference.mp4'));
  const bytes=await fs.readFile('tmp/smoke/reference.mp4');
  const input=new Input({source:new BufferSource(bytes),formats:ALL_FORMATS});const track=await input.getPrimaryVideoTrack();assert.ok(track);assert.equal(track.displayWidth,640);assert.equal(track.displayHeight,360);let packets=0;for await(const packet of new EncodedPacketSink(track).packets()){assert.ok(packet.timestamp>=0);packets++}assert.equal(packets,12);const duration=await input.computeDuration();assert.ok(Math.abs(duration-.5)<.01);input.dispose();
  // Detailed editing, timeline and layout coverage lives in the dedicated verify-* scripts.
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({pass:true,tests:['real scene renders','preview does not cut','deterministic scrubbing','same preview/export projection','height edit + undo','project file roundtrip','MP4 frame-by-frame export'],video:{width:640,height:360,frames:packets,duration,bytes:bytes.length}},null,2));
} catch(error) { await page.screenshot({path:'tmp/smoke/failure.png'}); console.log('Browser errors:', errors); throw error; }
finally {await browser.close()}
