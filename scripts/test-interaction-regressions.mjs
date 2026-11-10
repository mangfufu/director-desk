import assert from 'node:assert/strict';
import {build} from 'esbuild';
import fs from 'node:fs/promises';
import {createServer} from 'node:http';
import {chromium} from 'playwright-core';
const out='tmp/code-review/interaction-regression';await fs.mkdir(out,{recursive:true});
await build({entryPoints:['src/main.ts'],bundle:true,format:'iife',outfile:out+'/browser-main.js',platform:'browser',define:{'import.meta.env.DEV':'true'},logLevel:'silent'});
const server=createServer(async(req,res)=>{try{if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<link rel="stylesheet" href="/browser-main.css"><div id="app"></div><script src="/browser-main.js"></script>');}else {const name=req.url.split('?')[0];if(!['/browser-main.js','/browser-main.css'].includes(name)){res.writeHead(404).end();return;}res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':'text/css');res.end(await fs.readFile(out+name));}}catch(e){res.writeHead(500).end(e.message);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});
try{
 const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>window.__director);await page.waitForTimeout(800);
 // An invalid note may veto replacing its modal. Call the real existing model-import command after the veto.
 await page.evaluate(()=>document.querySelector('[data-act="production-notes"]').click());
 await page.locator('#note-story').fill('Unsaved note');await page.locator('#note-start').fill('5');await page.locator('#note-end').fill('2');
 const before=await page.locator('.modal').getAttribute('aria-label');
 await page.evaluate(()=>document.querySelector('[data-act="model-import"]').click());await page.waitForTimeout(150);
 assert.equal(await page.locator('.modal').getAttribute('aria-label'),before);assert.deepEqual(errors,[]);
 for(const action of ['export','resources','scene-sequence']){
  const button=page.locator('[data-act="'+action+'"]');if(!await button.count())continue;
  await button.first().evaluate(el=>el.click());await page.waitForTimeout(100);
  assert.equal(await page.locator('.modal').getAttribute('aria-label'),before);assert.deepEqual(errors,[]);
 }
 assert.equal(await page.locator('#note-story').inputValue(),'Unsaved note');
 // Close a valid form and test focused-button space semantics in the real event stack.
 await page.locator('#note-end').fill('7');await page.locator('#note-end').dispatchEvent('change');await page.evaluate(()=>document.querySelector('[data-act="close-modal"]').click());
 const entities=await page.evaluate(()=>window.__director.getProject().entities.length);
 await page.locator('[data-act="add-camera"]').focus();await page.keyboard.press('Space');
 assert.equal(await page.evaluate(()=>window.__director.getProject().entities.length),entities+1);
 assert.equal(await page.locator('[data-act="play"]').getAttribute('aria-label'),'播放');
 await page.evaluate(()=>document.activeElement.blur());await page.keyboard.press('Space');
 assert.equal(await page.locator('[data-act="play"]').getAttribute('aria-label'),'暂停');await page.keyboard.press('Space');
 await page.evaluate(()=>document.querySelector('[data-act="model-import"]').click());
 await page.locator('#model-files').waitFor();await page.evaluate(()=>document.querySelector('[data-act="close-modal"]').click());
 const rangeBundle=await build({entryPoints:['src/reconstruction/range.ts'],bundle:true,format:'iife',globalName:'RangeTest',write:false,platform:'browser',logLevel:'silent'});
 await page.addScriptTag({content:rangeBundle.outputFiles[0].text});
 const interval=await page.evaluate(()=>{const host=document.createElement('div');document.body.append(host);const range=RangeTest.createVideoRange(host,()=>{});range.set(40,50,60);const old=range.value;range.set(old.start,old.end,5);return {actual:range.value,displayStart:host.querySelector('#recon-start').value,displayEnd:host.querySelector('#recon-end').value,displayDuration:host.querySelector('output').textContent};});
 assert.deepEqual(interval,{actual:{start:0,end:5},displayStart:'0',displayEnd:'5',displayDuration:'5 s'});
 const clamps=await page.evaluate(()=>{
  const host=document.createElement('div');document.body.append(host);const range=RangeTest.createVideoRange(host,()=>{});range.setMinimum(.4);range.set(0,5,5);range.enable(true);
  const start=host.querySelector('#recon-start');start.value='5';start.dispatchEvent(new Event('change'));const edge=range.value;
  range.setMinimum(.7);const coarse=range.value;
  range.set(0,10,.12);return {edge,coarse,short:range.value,label:host.querySelector('output').textContent};
 });
 assert.ok(Math.abs(clamps.edge.end-clamps.edge.start-.4)<1e-8);assert.ok(clamps.coarse.end-clamps.coarse.start>=.7);assert.equal(clamps.label,'0.12 s');assert.deepEqual(errors,[]);
 // Exercise the workspace's file-change path with isolated IPC and metadata fixtures.
 await page.evaluate(()=>{
  const state={supported:true,accepted:true,ready:true,job:null,model:{},settings:{}};
  window.testSource='long';window.testStarts=[];
  window.directorDesktop={reconstruction:async(action,args)=>{
   if(action==='state')return {ok:true,data:state};
   if(action==='choose-video')return {ok:true,data:{path:window.testSource+'.mp4'}};
   if(action==='source-video')return {ok:true,data:{url:'http://127.0.0.1:1/'+args.path}};
   if(action==='start'){window.testStarts.push(args);return {ok:true,data:state};}
   throw Error(action);
  }};
  const open=document.createElement('button');open.dataset.act='video-reconstruction';document.body.append(open);open.click();
 });
 await page.locator('#recon-choose').click();
 const metadata=async duration=>{
  await page.locator('#recon-video-player').evaluate((video,duration)=>{
   Object.defineProperty(video,'duration',{configurable:true,value:duration});video.dispatchEvent(new Event('loadedmetadata'));
  },duration);
 };
 await metadata(60);
 await page.locator('.reconstruction-workspace #recon-end').fill('50');await page.locator('.reconstruction-workspace #recon-end').dispatchEvent('change');
 await page.locator('.reconstruction-workspace #recon-start').fill('40');await page.locator('.reconstruction-workspace #recon-start').dispatchEvent('change');
 await page.evaluate(()=>window.testSource='short');await page.locator('#recon-choose').click();await metadata(5);
 assert.equal(await page.locator('.reconstruction-workspace #recon-start').inputValue(),'0');
 assert.equal(await page.locator('.reconstruction-workspace #recon-end').inputValue(),'5');
 await page.locator('#recon-run').click();
 assert.deepEqual(await page.evaluate(()=>window.testStarts.map(({start,seconds})=>({start,seconds}))),[{start:0,seconds:5}]);
 await page.evaluate(()=>window.testSource='tiny');await page.locator('#recon-choose').click();await metadata(.12);await page.locator('#recon-run').click();
 assert.match(await page.locator('#recon-error').textContent(),/至少 0.4 秒/);
 assert.equal(await page.evaluate(()=>window.testStarts.length),1,'short intervals do not start a task');
 await page.locator('#recon-back').click();assert.deepEqual(errors,[]);
 console.log('PASS: blocked modal switches preserve forms; button/scene Space behave separately; new-video ranges reset and short inputs never start conversion.');
} finally{await browser.close();await new Promise(r=>server.close(r));}
