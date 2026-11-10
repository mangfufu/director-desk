import test from 'node:test';
import assert from 'node:assert/strict';
import { createScene } from '../src/scenes.ts';
import { PreviewCache,PREVIEW_CACHE_BYTES,previewRange,previewSignature,type PreviewFrames } from '../src/editor/preview-cache.ts';

test('preview signatures ignore manuscript edits, but include all image inputs',async()=>{
    const project=createScene('blank'),initial=await previewSignature(project);
    project.name='Rename';project.production={fixedPrompt:'Change notes',sceneReferenceIds:[],notes:[]};
    assert.equal(await previewSignature(project),initial);
    for(const patch of [{aspect:'9:16'},{fps:30},{duration:8},{depthVideo:{enabled:true,near:.1,far:10,invert:false,curve:1}},{lighting:{exposure:2}},{cuts:[]},{resources:[{id:'different-bytes'}]}]){
        assert.notEqual(await previewSignature({...project,...patch} as any),initial);
    }
    const copy=structuredClone(project);copy.entities[0].position[0]+=1;assert.notEqual(await previewSignature(copy),initial);
});
test('range bounds, frame limits and memory eviction leave project independent',()=>{
    const project=createScene('blank'),saved=JSON.stringify(project);
    assert.throws(()=>previewRange(project,{start:2,end:1}));assert.throws(()=>previewRange(project,{end:project.duration+1}));
    assert.throws(()=>previewRange(project,{cameraId:'missing'}));assert.throws(()=>previewRange({...project,duration:200},{end:200}));
    const range=previewRange(project,{end:1}),cache=new PreviewCache();
    const entry=(sceneId:string,signature='a',bytes=PREVIEW_CACHE_BYTES*.6):PreviewFrames=>({...range,sceneId,signature,bytes,fps:24,width:640,height:360,frames:[new Blob(['frame'])]});
    cache.put(entry('one'));cache.put(entry('two'));assert.equal(cache.count,1);assert.equal(cache.find('one','a',range),undefined);
    assert.ok(cache.find('two','a',range));cache.invalidate('two','b');assert.equal(cache.count,0);
    assert.throws(()=>cache.put(entry('one','a',PREVIEW_CACHE_BYTES+1)));assert.equal(cache.bytes,0);
    cache.put(entry('one'));cache.clear();assert.equal(cache.count,0);assert.equal(JSON.stringify(project),saved);
});
