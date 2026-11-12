import test from 'node:test';
import assert from 'node:assert/strict';
import {TransformQueue,type TransformSample} from '../src/editor/transform-queue.ts';

const sample=(x:number):TransformSample=>({position:[x,1,2],rotation:[0,x/100,0],scale:[1,1,1]});
test('a burst samples once at its final absolute transform; release flushes the last pending input',()=>{
    const queue=new TransformQueue(),applied:TransformSample[]=[];
    for(let i=0;i<100;i++)queue.push(sample(i));
    assert.equal(queue.flush(value=>applied.push(value)),true);assert.deepEqual(applied,[sample(99)]);
    assert.equal(queue.flush(value=>applied.push(value)),false);
    queue.push(sample(100));queue.flush(value=>applied.push(value));assert.deepEqual(applied.at(-1),sample(100));
});
test('cancel discards uncommitted input and a subsequent gesture does not replay it',()=>{
    const queue=new TransformQueue();queue.push(sample(20));queue.clear();
    assert.equal(queue.flush(()=>assert.fail('canceled transform ran')),false);
    queue.push(sample(30));queue.flush(value=>assert.deepEqual(value,sample(30)));
});
