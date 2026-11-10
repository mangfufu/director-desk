import test from 'node:test';
import assert from 'node:assert/strict';
import {createScene} from '../src/scenes.ts';
import {entity} from '../src/model.ts';
import {timelineActionState} from '../src/ui/timeline-actions.ts';

test('split availability matches frame boundaries, multi-selection and locked objects',()=>{
    const p=createScene('blank');p.fps=24;p.duration=10;
    const e=entity('actor','human-adult','演员',[0,0,0]);p.entities.push(e);
    e.clips=[{id:'a',start:0,end:4,action:'walk',speed:1},{id:'b',start:4,end:8,action:'walk',speed:1}];
    const a={kind:'action' as const,entityId:e.id,id:'a'},b={...a,id:'b'};
    assert.equal(timelineActionState(p,[],2).reason,'先选择片段');
    assert.deepEqual(timelineActionState(p,[a],0).splittable,[]);
    assert.deepEqual(timelineActionState(p,[a],1/24).splittable,[a]);
    assert.deepEqual(timelineActionState(p,[a,b],4).splittable,[]);
    assert.deepEqual(timelineActionState(p,[a,b],5).splittable,[b]);
    assert.deepEqual(timelineActionState(p,[a],4-1/24).splittable,[a]);
    e.locked=true;assert.equal(timelineActionState(p,[a],2).reason,'所选对象已锁定');
    e.locked=false;assert.equal(timelineActionState(p,[{...a,id:'missing'}],2).reason,'请重新选择片段');
});
