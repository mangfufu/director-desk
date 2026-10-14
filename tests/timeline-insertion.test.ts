import test from 'node:test';
import assert from 'node:assert/strict';
import { demoProject, assertProject, clone } from '../src/model.ts';
import { createTimelineInsertDrag } from '../src/editor/timeline-insert-drag.ts';
import { insertionPoint, planMotionInsertion } from '../src/editor/timeline-insertion.ts';
import { splitClip } from '../src/clip-editing.ts';

test('library insertion chooses the pointed half, preserving durations and consuming gaps',()=>{
    const clips=[{id:'a',start:2,end:5},{id:'b',start:6,end:8},{id:'c',start:15,end:17}];
    const before=planMotionInsertion(clips,2.5,3,24);
    assert.equal(before.side,'before');assert.deepEqual([before.start,before.end],[2,5]);
    assert.deepEqual(before.clips.map(c=>[c.start,c.end]),[[5,8],[8,10],[15,17]]);
    const after=planMotionInsertion(clips,4.5,3,24);
    assert.equal(after.side,'after');assert.deepEqual([after.start,after.end],[5,8]);
    assert.deepEqual(after.clips.map(c=>[c.start,c.end]),[[2,5],[8,10],[15,17]]);
    assert.deepEqual(clips.map(c=>c.start),[2,6,15]);
    assert.deepEqual(planMotionInsertion(clips,0,1,24).clips,clips);
});

test('touching frame boundaries never become overlapping after ripple calculations',()=>{
    for(const fps of [24,30,50,59,60,90,120])for(let i=1;i<200;i++){
        const clips=[{start:i/fps,end:(i+7)/fps},{start:(i+7)/fps,end:(i+19)/fps}];
        const plan=planMotionInsertion(clips,(i+5)/fps,3/fps,fps);
        const ranges=[...plan.clips,plan].sort((a,b)=>a.start-b.start);
        ranges.forEach((r,j)=>{if(j)assert.ok(r.start>=ranges[j-1].end,`${fps}fps frame ${i}`);});
    }
});

test('moving before and after neighbours is absolute, undoable and does not change action content',()=>{
    const p=demoProject(),e=p.entities[0];
    e.clips=[{id:'a',start:0,end:2,action:'walk',speed:1},{id:'b',start:2,end:5,action:'run',speed:1},{id:'c',start:5,end:7,action:'wave',speed:1}];
    const selection={kind:'action' as const,entityId:e.id,id:'c'},original=clone(p);
    const drag=createTimelineInsertDrag(p,[selection],selection);
    drag.apply(-4,2.5);assert.deepEqual(e.clips.map(c=>[c.start,c.end]),[[0,2],[4,7],[2,4]]);assertProject(p);
    drag.apply(-2,4.5);assert.deepEqual(e.clips.map(c=>[c.start,c.end]),[[0,2],[2,5],[5,7]]);assertProject(p);
    for(let i=0;i<50;i++)drag.apply(-4,2.5);
    assert.deepEqual(e.clips.map(c=>[c.start,c.end]),[[0,2],[4,7],[2,4]]);
    drag.apply(0,6);assert.deepEqual(p,original);
    drag.apply(20,26);assert.equal(p.duration,27);assertProject(p);
});

test('multi-track groups cross occupied ranges with their offsets intact',()=>{
    const p=demoProject(),actors=p.entities.filter(e=>e.kind==='actor').slice(0,2);
    actors.forEach((e,i)=>{e.clips=[{id:`moving-${i}`,start:i,end:i+2,action:'walk',speed:1},{id:`fixed-${i}`,start:4,end:7,action:'run',speed:1}];});
    const selections=actors.map(e=>({kind:'action' as const,entityId:e.id,id:e.clips[0].id}));
    const drag=createTimelineInsertDrag(p,selections,selections[0]);
    drag.apply(4,4.5);
    assert.deepEqual(actors.map(e=>e.clips.map(c=>[c.start,c.end])),[[[4,6],[6,9]],[[5,7],[7,10]]]);assertProject(p);
    drag.apply(20,20);assert.deepEqual(actors.map(e=>e.clips[0].start),[20,21]);assertProject(p);
    drag.apply(-10,-10);assert.deepEqual(actors.map(e=>e.clips[0].start),[0,1]);assertProject(p);
    actors[0].locked=true;assert.throws(()=>createTimelineInsertDrag(p,selections,selections[0]),/锁定/);
});

test('path insertion preserves source intervals and can return to the original timing',()=>{
    const p=demoProject(),e=p.entities[1],left={kind:'path' as const,entityId:e.id,index:0};
    splitClip(p,left,3);const original=clone(e.path!);
    const right={...left,index:1},drag=createTimelineInsertDrag(p,[right],right);
    drag.apply(-3,1);
    const ranges=e.path!.sections!;assert.equal(ranges[1].start,0);assert.equal(ranges[0].start,ranges[1].end);
    ranges.forEach((r,i)=>assert.deepEqual([r.from,r.to],[original.sections![i].from,original.sections![i].to]));assertProject(p);
    drag.apply(0,4);assert.deepEqual(e.path,original);assertProject(p);
});

test('grabbing the middle of a long clip still inserts into the pointed gap',()=>{
    const p=demoProject(),e=p.entities[0];
    e.clips=[{id:'moving',start:5,end:8,action:'walk',speed:1},{id:'takeoff',start:9.5,end:10.5,action:'run',speed:1},{id:'walk',start:10.5,end:14.5,action:'walk',speed:1}];
    const selection={kind:'action' as const,entityId:e.id,id:'moving'},before=clone(p);
    const drag=createTimelineInsertDrag(p,[selection],selection);
    const gap=drag.preview(4,10.5,.1);
    assert.deepEqual(p,before,'hover never changes project');
    assert.equal(gap.range.start,10.5);
    drag.commit(gap);
    assert.deepEqual(e.clips.map(c=>[c.start,c.end]),[[10.5,13.5],[9.5,10.5],[13.5,17.5]]);assertProject(p);
    assert.equal(insertionPoint([{start:0,end:8},{start:9,end:12}],8.5,6).start,8,'free gap clamps the leading edge past the previous action');
    assert.equal(insertionPoint([{start:0,end:8},{start:8,end:9}],7.94,6,.1).start,8,'boundary has a usable pointer target');
});
