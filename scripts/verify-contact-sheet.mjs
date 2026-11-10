import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
const output='output/playwright/contact-sheet';await fs.mkdir(output,{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:0}});await server.listen();
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);await page.waitForFunction(()=>window.__director);
 await page.evaluate(async()=>{
  const {createScene}=await import('/src/scenes.ts'),{entity}=await import('/src/model.ts');
  const p=createScene('blank'),camera=p.entities.find(e=>e.kind==='camera');p.duration=8;p.name='Contact QA';
  camera.position=[0,1.4,6];camera.camera.target=[0,1,0];camera.camera.focal=35;
  const actor=entity('actor','human-adult','前景人物');actor.id='contact-person';actor.visibility=[{id:'show',start:0,end:.9}];p.entities.push(actor);
  const behind=entity('actor','human-adult','画外人物');behind.position=[0,0,12];p.entities.push(behind);
  const side=structuredClone(camera);side.id='contact-side';side.name='侧机位';side.position=[6,4,2];side.camera.target=[0,0,0];p.entities.push(side);
  p.cuts=Array.from({length:8},(_,time)=>({time,cameraId:time<4?camera.id:side.id}));
  p.production={fixedPrompt:'',sceneReferenceIds:[],notes:[{id:'n',start:0,end:1,actorId:actor.id,story:'<script>bad()</script>',emotion:'紧张',dialogue:'检查原文',action:'停步'}]};
  window.__director.replaceProject(p);window.__director.setTime(3);window.__contactSaved=JSON.stringify(window.__director.getDocument());
 });
 const rendered=await page.evaluate(async()=>{
  const api=window.__director,engine=api.getEngine(),original=engine.project,time=engine.time;
  const {renderContactShots}=await import('/src/production/contact-render.ts'),{contactShots}=await import('/src/production/contact-sheet.ts');
  const p=api.getProject(),shots=contactShots(p),cards=[];
  await renderContactShots(engine,p,shots.slice(0,2),new AbortController().signal,card=>cards.push(card));
  if(engine.project!==original||engine.time!==time||engine.exporting)throw Error('Contact rendering did not restore editor');
  const abort=new AbortController();let count=0,cancelled=false;
  try{await renderContactShots(engine,p,shots,abort.signal,()=>{count++;abort.abort();});}catch(e){cancelled=e.name==='AbortError';}
  return {people:cards.map(c=>c.people),different:cards[0].image!==cards[1].image,count,cancelled,restored:engine.project===original&&engine.time===time&&!engine.exporting,saved:window.__contactSaved===JSON.stringify(api.getDocument())};
 });
 assert.deepEqual(rendered.people,[['前景人物'],[]]);assert.ok(rendered.different&&rendered.cancelled&&rendered.restored&&rendered.saved);assert.equal(rendered.count,1);
 await page.locator('[data-menu="production"]').click();await page.locator('[data-act="contact-sheet"]').click();
 await page.waitForFunction(()=>document.querySelectorAll('#contact-cards .contact-card').length===6&&!document.querySelector('#contact-next').disabled);
 await page.screenshot({path:`${output}/preview.png`});
 const pictures=await page.locator('#contact-cards img').evaluateAll(images=>images.map(img=>img.src));assert.notEqual(pictures[2],pictures[4],'contact thumbnails switch to the actual cut camera');
 const overflow=await page.locator('.contact-modal').evaluate(root=>[...root.querySelectorAll('button,input,textarea,img')].filter(e=>{const r=e.getBoundingClientRect();return r.bottom>innerHeight||r.right>innerWidth||r.top<0;}).map(e=>e.id));assert.deepEqual(overflow,[]);
 await page.locator('#contact-next').click();await page.waitForFunction(()=>document.querySelectorAll('#contact-cards .contact-card').length===2&&!document.querySelector('#contact-export').disabled);
 assert.equal(await page.locator('#contact-page').innerText(),'2 / 2');
 const download=page.waitForEvent('download');await page.locator('#contact-export').click();const file=await download;await file.saveAs(`${output}/sheet.html`);
 const html=await fs.readFile(`${output}/sheet.html`,'utf8');assert.equal((html.match(/class="contact-card"/g)||[]).length,8);assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));
 assert.equal(await page.evaluate(()=>window.__contactSaved===JSON.stringify(window.__director.getDocument())),true);
 const share=await browser.newPage();await share.setContent(html);await share.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0));await share.screenshot({path:`${output}/export.png`});await share.close();
 await page.locator('.contact-modal [data-act="close-modal"]').click();
 const mcpDownload=page.waitForEvent('download');
 const job=await page.evaluate(async()=>await window.__director.callTool('director_export',{kind:'contact-sheet',requestId:'contact-export'}));assert.equal(job.ok,true,job.error);
 await (await mcpDownload).saveAs(`${output}/mcp.html`);
 await page.waitForFunction(async id=>(await window.__director.callTool('director_job',{id})).data.status==='completed',job.data.jobId);
 assert.deepEqual(errors,[]);console.log('PASS: contact samples, actual pictures, visibility, cancellation/restoration, pagination, HTML safety/sharing, browser MCP and narrow layout');
}finally{await browser.close();await server.close();}
