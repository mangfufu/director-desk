import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {discover} from '../desktop/blender-import/discovery.cjs';

await fs.mkdir('tmp/blender-import',{recursive:true});
const output=await fs.mkdtemp(path.resolve('tmp/blender-import/material-fixture-'));
const source=path.join(output,'materials.blend'),converted=path.join(output,'converted');await fs.mkdir(converted);
const blender=await discover(process.env.BLENDER_PATH);assert.ok(blender.path);
async function run(script,args){
    const logfile=path.join(output,path.basename(script)+'.log'),chunks=[];
    const code=await new Promise((resolve,reject)=>{
        const child=spawn(blender.path,['--background','--factory-startup','--disable-autoexec','--python-exit-code','1','--python',path.resolve(script),'--',...args],{windowsHide:true});
        child.stdout.on('data',b=>chunks.push(b));child.stderr.on('data',b=>chunks.push(b));child.once('error',reject);child.once('close',resolve);
    });
    const log=Buffer.concat(chunks);await fs.writeFile(logfile,log);assert.equal(code,0,log.toString().slice(-5000));
}
await run('tests/fixtures/blender-materials.py',[source]);const before=await fs.readFile(source);
await run('tests/fixtures/blender-motion-detection.py',[]);
await run('desktop/blender-import/export-scene.py',[source,converted,'static']);assert.deepEqual(await fs.readFile(source),before);
const manifest=JSON.parse(await fs.readFile(path.join(converted,'scene.json'),'utf8'));
assert.ok(Math.abs(manifest.lights[0].energy-2.3)<.0001);assert.equal(manifest.lights[0].temperature,4100);
const models=new Map();for(const m of manifest.models){const b=await fs.readFile(path.join(converted,m.file));models.set(m.name,JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString()));}
const material=name=>models.get(name).materials[0];
assert.deepEqual(material('Solid red').pbrMetallicRoughness.baseColorFactor.map(x=>+x.toFixed(2)),[.7,.02,.04,1]);
assert.deepEqual(material('Group purple').pbrMetallicRoughness.baseColorFactor.map(x=>+x.toFixed(2)),[.4,.02,.6,1]);
assert.equal((await fs.readdir(converted)).some(name=>name.startsWith('baked-')),false);
assert.ok(!models.get('Procedural checker').images?.length);
assert.deepEqual(material('Procedural checker').pbrMetallicRoughness.baseColorFactor.map(x=>+x.toFixed(2)),[.41,.35,.41,1]);
const expected=JSON.parse(await fs.readFile(source+'.expected.json','utf8'));
assert.deepEqual(material('Adjusted image').pbrMetallicRoughness.baseColorFactor.map(x=>+x.toFixed(2)),[.3,.6,.9,1]);
assert.deepEqual(material('Viewport color').pbrMetallicRoughness.baseColorFactor.map(x=>+x.toFixed(2)),expected.plainColor.map(x=>+x.toFixed(2)));
for(const name of ['Image green','Adjusted image']){
    assert.ok(models.get(name).images.length);assert.ok(material(name).pbrMetallicRoughness.baseColorTexture);
    const entry=manifest.models.find(m=>m.name===name),bytes=await fs.readFile(path.join(converted,entry.file)),start=28+bytes.readUInt32LE(12);
    for(const image of models.get(name).images){
        if(image.mimeType!=='image/webp')continue;
        const view=models.get(name).bufferViews[image.bufferView],data=bytes.subarray(start+(view.byteOffset||0),start+(view.byteOffset||0)+view.byteLength);
        assert.equal(data.subarray(0,4).toString(),'RIFF');assert.equal(data.subarray(12,16).toString(),'VP8L','WebP must be lossless');
    }
}
assert.equal(material('Glass').extensions.KHR_materials_transmission.transmissionFactor,1);
assert.ok(Math.abs(material('Glass').extensions.KHR_materials_ior.ior-1.45)<.001);
assert.equal(material('Metal').pbrMetallicRoughness.metallicFactor??1,1);
assert.ok(Math.abs(material('Metal').pbrMetallicRoughness.roughnessFactor-.2)<.001);
console.log('PASS legacy color, nested group inputs, original UV images, procedural color fallback without baking, glass, metal, source unchanged',output);
