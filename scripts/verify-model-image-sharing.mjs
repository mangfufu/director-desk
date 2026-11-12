import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {readModelFiles} from '../desktop/model-files.ts';

const folder=process.argv[2];if(!folder)throw Error('Pass a converted material fixture directory');
const manifest=JSON.parse(await fs.readFile(path.join(folder,'scene.json'),'utf8'));
const model=manifest.models.find(m=>m.name===(process.argv[3]||'Image green'));assert.ok(model);
const pack=await readModelFiles(path.resolve(folder,model.file));
const server=await createServer({server:{host:'127.0.0.1',port:0}});await server.listen();
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
    const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);await page.waitForFunction(()=>window.__director);
    const result=await page.evaluate(async pack=>{
        const T=await import('/node_modules/three/build/three.module.js'),{loadGltfModel}=await import('/src/resources/gltf-model.ts');
        const a=await loadGltfModel(pack),b=await loadGltfModel(pack),ia=a.instantiate(),ib=b.instantiate();
        const maps=instance=>{const out=[];instance.root.traverse(n=>{if(n.isMesh)for(const m of Array.isArray(n.material)?n.material:[n.material])if(m.map)out.push(m.map);});return out;};
        const ma=maps(ia),mb=maps(ib);if(!ma.length||!mb.length)throw Error('Missing imported image');
        const shared=ma[0].source===mb[0].source,independent=ma[0]!==mb[0];
        const scene=new T.Scene(),camera=new T.PerspectiveCamera(45,1,.1,100),renderer=new T.WebGLRenderer({preserveDrawingBuffer:true});
        renderer.setSize(128,128);renderer.setClearColor('#000000');
        scene.add(ib.root,new T.HemisphereLight('#ffffff','#ffffff',3));camera.position.set(6,0,5);camera.lookAt(6,0,0);
        const render=()=>{renderer.render(scene,camera);return renderer.domElement.toDataURL();};
        const before=render();a.dispose();const after=render();b.dispose();renderer.dispose();
        return {shared,independent,afterDispose:before===after};
    },pack);
    assert.deepEqual(errors,[]);assert.deepEqual(result,{shared:true,independent:true,afterDispose:true});
    console.log('PASS real GLB texture sharing and surviving model render after other source disposal',result);
}finally{await browser.close();await server.close();}
