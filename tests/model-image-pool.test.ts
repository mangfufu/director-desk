import assert from 'node:assert/strict';
import test from 'node:test';
import {Texture} from 'three';
import {shareModelImages} from '../src/resources/model-image-pool.ts';

test('identical images share GPU source while retaining sampler state and source lifetime',()=>{
    const a=new Texture({width:4,height:4}),b=new Texture({width:4,height:4}),c=new Texture({width:4,height:4});
    a.repeat.set(2,3);b.repeat.set(4,5);
    const first=shareModelImages([{texture:a,key:'fixture-image'}]);
    const second=shareModelImages([{texture:b,key:'fixture-image'},{texture:c,key:'fixture-image'}]);
    assert.equal(a.source,b.source);assert.equal(b.source,c.source);
    b.repeat.set(9,9);assert.deepEqual(a.repeat.toArray(),[2,3]);
    first.release();first.release();
    const d=new Texture({width:4,height:4}),third=shareModelImages([{texture:d,key:'fixture-image'}]);
    assert.equal(d.source,b.source);second.release();third.release();
    const e=new Texture({width:4,height:4}),fourth=shareModelImages([{texture:e,key:'fixture-image'}]);
    assert.notEqual(e.source,b.source);fourth.release();
});
