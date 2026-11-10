import fs from 'node:fs/promises';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
const stage=process.argv.includes('--before')?'before':'after',out='tmp/human-silhouettes';
await fs.mkdir(out,{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:0,watch:null}});await server.listen();
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1600,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);await page.waitForFunction(()=>window.__director);
 const result=await page.evaluate(async()=>{
  const T=await import('/node_modules/three/build/three.module.js');
  const {makeHuman}=await import('/src/assets/humanoid.ts'),{animateHuman}=await import('/src/assets/human-animation.ts');
  const {entity,clip}=await import('/src/model.ts'),{HUMAN_ASSETS}=await import('/src/assets/catalog/humans.ts');
  const {disposeTree}=await import('/src/assets/dispose.ts');
  const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(240,300);renderer.setClearColor('#272727');
  const scene=new T.Scene();scene.add(new T.HemisphereLight(0xffffff,0x777777,2));
  const key=new T.DirectionalLight(0xffffff,3);key.position.set(-3,5,4);scene.add(key);
  const camera=new T.PerspectiveCamera(35,240/300,.01,50),samples=[],metrics=[],legacy=[];
  const draw=(rig,yaw)=>{rig.root.rotation.y=yaw;rig.root.updateMatrixWorld(true);camera.position.set(0,1.05,3.7);camera.lookAt(0,.9,0);renderer.render(scene,camera);return renderer.domElement.toDataURL();};
  for(const a of HUMAN_ASSETS){const e=entity('actor',a.id,a.name);e.color='#b8b8b8';e.height=1.75;const rig=makeHuman(e);scene.add(rig.root);
   let vertices=0,triangles=0,meshes=0;rig.root.traverse(o=>{if(o.isMesh){meshes++;vertices+=o.geometry.attributes.position.count;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});
   for(const [view,yaw] of [['front',0],['side',Math.PI/2]])samples.push({asset:a.id,name:a.name,view,image:draw(rig,yaw)});
   metrics.push({asset:a.id,vertices,triangles,meshes});scene.remove(rig.root);disposeTree(rig.root);
  }
  for(const asset of ['person','woman','crowd']){const e=entity(asset==='crowd'?'crowd':'actor',asset,asset);e.color='#b8b8b8';e.height=1.75;const rig=makeHuman(e);scene.add(rig.root);for(const [view,yaw] of [['front',0],['side',Math.PI/2]])legacy.push({asset,name:asset,view,image:draw(rig,yaw)});scene.remove(rig.root);disposeTree(rig.root);}
  const poses=[];
  for(const asset of ['human-full','human-muscular','human-outfit-dress','human-outfit-robe','human-outfit-armor','human-outfit-uniform'])for(const action of ['idle','walk','sit','wave']){
   const e=entity('actor',asset,asset);e.height=1.75;e.color='#b8b8b8';e.clips=[clip(action,0,4)];const r=makeHuman(e);scene.add(r.root);animateHuman(r,e,action==='sit'?3.8:.7);poses.push({asset,name:asset.replace('human-',''),view:action,image:draw(r,.4)});scene.remove(r.root);disposeTree(r.root);
  }
  renderer.dispose();return {samples,metrics,poses,legacy};
 });
 await fs.writeFile(`${out}/${stage}-metrics.json`,JSON.stringify(result.metrics,null,2));
 const sheet=await browser.newPage();await sheet.setContent('<canvas></canvas>');
 for(const [name,items] of [['bodies',result.samples.slice(0,24)],['outfits',result.samples.slice(24)],['poses',result.poses],['legacy',result.legacy]]){
  const url=await sheet.evaluate(async items=>{const c=document.querySelector('canvas');c.width=6*240;c.height=Math.ceil(items.length/6)*328;const ctx=c.getContext('2d');ctx.fillStyle='#272727';ctx.fillRect(0,0,c.width,c.height);for(let i=0;i<items.length;i++){const s=items[i],im=new Image();im.src=s.image;await im.decode();const x=i%6*240,y=Math.floor(i/6)*328;ctx.drawImage(im,x,y);ctx.fillStyle='white';ctx.font='14px sans-serif';ctx.fillText(s.name+' / '+s.view,x+8,y+320);}return c.toDataURL();},items);
  await fs.writeFile(`${out}/${stage}-${name}.png`,Buffer.from(url.split(',')[1],'base64'));
 }
 if(errors.length)throw Error(errors.join('\n'));console.log(`Rendered ${result.samples.length} views and ${result.poses.length} poses: ${out}/${stage}-*.png`);
}finally{await browser.close();await server.close();}
