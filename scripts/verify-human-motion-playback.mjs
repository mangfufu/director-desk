import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
await fs.mkdir('tmp/human-actions/playback',{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:0,watch:null}});await server.listen();
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);await page.waitForFunction(()=>window.__director);
 const report=await page.evaluate(async()=>{
  const {entity,clip}=await import('/src/model.ts'),{createScene}=await import('/src/scenes.ts'),{AUTHORED_HUMAN_ACTIONS}=await import('/src/assets/authored-human-actions.ts');
  const api=window.__director,p=createScene('blank');p.name='手工动作播放检查';p.aspect='3:4';p.room.enabled=false;
  const actor=entity('actor','human-adult','动作演示');actor.id='authored-actor';actor.actionBlend=.2;p.entities.push(actor);
  const camera=p.entities.find(e=>e.camera);camera.position=[2.5,2.2,5];camera.camera.target=[0,1.1,0];camera.camera.focal=52;
  let at=0;const ranges=[];
  for(const [action,motion]of Object.entries(AUTHORED_HUMAN_ACTIONS)) {
    const duration=motion.loop?(['idle','sit','crouch'].includes(action)?2:motion.duration*2):(['lie','guard'].includes(action)?1.5:motion.duration);
    actor.clips.push(clip(action,at,at+duration));ranges.push({action,start:at,end:at+duration});at+=duration;
  }
  p.duration=Math.ceil(at*24)/24;api.replaceProject(p);const engine=api.getEngine();let maxTime=0,count=0;
  const reviews=[];
  for(const range of ranges) {
    for(let frame=0;frame<Math.ceil((range.end-range.start)*60);frame++) {
      const time=range.start+frame/60;if(time>=range.end)break;const start=performance.now();engine.sample(time);maxTime=Math.max(maxTime,performance.now()-start);count++;
      const rig=engine.rigs.get(actor.id);for(const node of [rig.hips,...Object.values(rig.joints)])if(!node.matrixWorld.elements.every(Number.isFinite))throw Error(`${range.action}: invalid bone frame ${frame}`);
    }
    for(const phase of [.2,.4,.6,.8]){const time=range.start+(range.end-range.start)*phase;reviews.push({action:range.action,phase,image:engine.renderOutput(time,300,400,'program').toDataURL()});}
  }
  return {duration:p.duration,ranges,maxTime,count,reviews};
 });
 for(const r of report.reviews)await fs.writeFile(`tmp/human-actions/playback/${r.action}-${r.phase}.png`,Buffer.from(r.image.split(',')[1],'base64'));
 const sheet=await browser.newPage();await sheet.setContent('<canvas></canvas>');
 await sheet.evaluate(async reviews=>{const c=document.querySelector('canvas'),ctx=c.getContext('2d');c.width=1200;c.height=reviews.length/4*425;
 for(let i=0;i<reviews.length;i++){const r=reviews[i],img=new Image();img.src=r.image;await img.decode();const x=i%4*300,y=Math.floor(i/4)*425;ctx.drawImage(img,x,y);ctx.fillStyle='#111';ctx.fillRect(x,y+400,300,25);ctx.fillStyle='#fff';ctx.font='16px sans-serif';ctx.fillText(`${r.action} ${Math.round(r.phase*100)}%`,x+8,y+418);}},report.reviews);
 await sheet.locator('canvas').screenshot({path:'tmp/human-actions/playback/sequence.png'});
 const bytes=await page.evaluate(end=>window.__director.exportForTest({width:480,height:640,fps:60,cameraId:'program',monochrome:false,start:0,end,format:'mp4'}),report.duration);
 assert.ok(bytes.length>500000);await fs.writeFile('tmp/human-actions/playback/23-actions.mp4',Buffer.from(bytes));
 await fs.writeFile('tmp/human-actions/playback/report.json',JSON.stringify({duration:report.duration,ranges:report.ranges,count:report.count,maxTime:report.maxTime,bytes:bytes.length},null,2));
 assert.deepEqual(errors,[]);console.log(`All 23 actions: ${report.count} evaluated frames; ${report.duration}s actual 60fps MP4; no renderer errors.`);
}finally{await browser.close();await server.close();}
