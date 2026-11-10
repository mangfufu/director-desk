import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
await fs.mkdir('tmp/workspace-review',{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:0,watch:{ignored:['**/tmp/**','**/.local/**']}}});await server.listen();
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);await page.waitForFunction(()=>window.__director);
 const ids=await page.evaluate(async()=>{
  const {demoProject,entity}=await import('/src/model.ts');const p=demoProject();p.name='编辑工作区验证';p.creationMode='geometry';
  const actor=entity('actor','human-adult','预览人物');actor.clips=[];p.entities.push(actor);window.__director.replaceProject(p);return {actor:actor.id};
 });
 assert((await page.title()).includes('编辑工作区验证'));
 assert.equal(await page.locator('.project-title,.timeline-footer').count(),0);
 assert(await page.locator('.transport #timeline-zoom-in').isVisible());
 await page.locator('#resource-home').click(); await page.locator('[data-side=assets]').click();await page.waitForFunction(()=>document.querySelector('#library-count')?.textContent==='16 项');
 await page.locator('[data-library-view=list]').click();assert.equal(await page.locator('.library-grid img').count(),0);
 assert(await page.locator('.asset-list-item').count()>0);
 await page.locator('[data-library-view=grid]').click();await page.waitForFunction(()=>document.querySelector('.library-grid img:not([hidden])'));
 await page.screenshot({path:'tmp/workspace-review/assets.png'});
 await page.evaluate(async id=>{await window.__director.callTool('director_view',{entityId:id,time:0});},ids.actor);
 await page.locator('[data-act=color-open]').click();assert.equal(await page.locator('#modal-root > *').count(),0);
 await page.locator('[data-swatch="#d95656"]').click();
 assert.equal(await page.evaluate(id=>window.__director.getProject().entities.find(e=>e.id===id).color,ids.actor),'#d95656');
 assert(await page.locator('.inline-color-palette').isVisible());
 await page.keyboard.press('Control+z');assert.notEqual(await page.evaluate(id=>window.__director.getProject().entities.find(e=>e.id===id).color,ids.actor),'#d95656');
 await page.locator('[data-act=color-open]').click();
 await page.locator('[data-inspect=actions]').click();assert((await page.locator('.action-empty').boundingBox()).height<40);
 await page.locator('#action-picker-toggle').click();await page.locator('[data-add-action=run]').hover();await page.waitForFunction(()=>document.querySelector('.action-preview-canvas canvas'));
 const canvas=page.locator('.action-preview-canvas');const shot1=await canvas.screenshot();await page.waitForTimeout(250);const shot2=await canvas.screenshot();assert(!shot1.equals(shot2),'Preview must actually animate');
 await page.screenshot({path:'tmp/workspace-review/action-picker.png'});
 await page.locator('[data-add-action=run]').click();
 assert(await page.evaluate(id=>window.__director.getProject().entities.find(e=>e.id===id).clips.some(c=>c.action==='run'),ids.actor));
 assert.equal(await page.locator('.action-preview-canvas canvas').count(),0);
 const keys=()=>page.locator('[data-track-key]').evaluateAll(rows=>rows.map(row=>row.dataset.trackKey));
 const before=await keys(),last=page.locator('[data-track-key]').last();
 await last.locator('[data-track-grip]').scrollIntoViewIfNeeded();
 const grip=await last.locator('[data-track-grip]').boundingBox();
 const host=await page.locator('#timeline-content').boundingBox();
 await page.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2);await page.mouse.down();
 await page.mouse.move(grip.x+grip.width/2,host.y+76,{steps:12});await page.waitForTimeout(400);await page.mouse.up();
 const after=await keys();assert.notDeepEqual(after,before);
 assert.deepEqual(await page.evaluate(()=>window.__director.getProject().editorView.trackOrder),after);
 assert.equal(await page.locator('[data-track-reordering]').count(),0);
 assert.equal(await page.locator('.timeline-tracks > .timeline-row').nth(1).getAttribute('class'),'timeline-row cut-row');
 await page.keyboard.press('Control+z');assert.deepEqual(await keys(),before);
 await page.keyboard.press('Control+Shift+z');assert.deepEqual(await keys(),after);
 // Serialization and shared validation preserve ordering without changing entity order.
 await page.evaluate(async()=>{const {assertProject}=await import('/src/model.ts');const p=JSON.parse(JSON.stringify(window.__director.getProject()));assertProject(p);window.__director.replaceProject(p);});
 assert.deepEqual(await keys(),after);
 for (const width of [1440,1280]) {
  await page.setViewportSize({width,height:720});await page.waitForTimeout(150);
  const overflow=await page.evaluate(()=>[...document.querySelectorAll('.topbar,.transport,.library-tools')].filter(el=>el.scrollWidth>el.clientWidth+2).map(el=>el.className));
  assert.deepEqual(overflow,[],'No horizontal toolbar overflow');
  await page.screenshot({path:`tmp/workspace-review/layout-${width}.png`});
 }
 assert.deepEqual(errors,[]);
 console.log('Workspace: project title, integrated zoom, sixteen shapes, list/grid, inline color/undo, animated action dropdown/add/dispose, track reorder/undo/serialization/pinning and toolbar widths passed.');
} finally {await browser.close();await server.close();}
