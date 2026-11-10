import test from 'node:test';
import assert from 'node:assert/strict';
import {createScene} from '../src/scenes.ts';
import {SceneSession} from '../src/scenes/sequence-session.ts';
import {packVersion,unpackVersion} from '../src/versions/snapshot.ts';

test('shared version packing preserves the existing stored shape, complete scenes and stable source hashes',async()=>{
    const document=new SceneSession(createScene('blank')).exportDocument();
    document.media=[{id:'media-'+'b'.repeat(64),name:'图像',mime:'image/png',data:'data:image/png;base64,YWJj',width:2,height:2,duration:0}];
    const before=structuredClone(document),first=await packVersion(document,'  方案  '),second=await packVersion(document,'副本');
    assert.equal(first.item.info.name,'方案');assert.notEqual(first.item.info.id,second.item.info.id);
    assert.deepEqual(Object.keys(first.item),['info','document','resources','media']);
    assert.equal('resources' in first.item.document,false);assert.equal('media' in first.item.document,false);
    assert.deepEqual(first.item.info.sources,second.item.info.sources);
    assert.equal(first.item.info.sources[0],Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(document.media[0])))),v=>v.toString(16).padStart(2,'0')).join(''));
    const recovered=unpackVersion(JSON.parse(JSON.stringify(first.item)),first.sources,document.projectId!);
    assert.deepEqual(recovered,before);assert.deepEqual(document,before);
    recovered.scenes[0].state.entities[0].name='独立编辑';
    assert.deepEqual(unpackVersion(first.item,first.sources,document.projectId!),before);
    assert.throws(()=>unpackVersion(first.item,new Map(),document.projectId!),/缺失/);
    assert.throws(()=>unpackVersion(first.item,first.sources,'other'),/不属于/);
    await assert.rejects(packVersion(document,' '),/版本名称/);
    await assert.rejects(packVersion({...document,projectId:undefined},'方案'),/标识/);
});
