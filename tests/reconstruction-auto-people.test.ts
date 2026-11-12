import {test} from 'node:test';
import assert from 'node:assert/strict';
import {automaticPeopleDetector} from '../src/reconstruction/auto-people.ts';
test('automatic detection expands past three and ten people, including later arrivals',async()=>{
    let capacity=2,count=1,last=-1;
    const sizes:number[]=[];
    const detect=automaticPeopleDetector({
        async setOptions(options){capacity=options.numPoses;sizes.push(capacity);},
        detectForVideo(_image,timestamp){assert.ok(timestamp>last);last=timestamp;return {landmarks:Array(Math.min(capacity,count)).fill([])};},
    });
    const frame={} as HTMLCanvasElement;
    assert.equal((await detect(frame,0)).landmarks.length,1);assert.deepEqual(sizes,[]);
    count=12;assert.equal((await detect(frame,100)).landmarks.length,12);assert.deepEqual(sizes,[4,8,16]);
    count=0;assert.equal((await detect(frame,101)).landmarks.length,0);assert.deepEqual(sizes,[4,8,16]);
});
