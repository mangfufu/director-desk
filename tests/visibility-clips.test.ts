import test from 'node:test';
import assert from 'node:assert/strict';
import { assertProject, clone, entity } from '../src/model.ts';
import { createScene } from '../src/scenes.ts';
import { assertVisibility, entityVisibleAt, visibilityClips } from '../src/scenes/visibility.ts';
import { clipRange, deleteClip, dragClipRange, setClipRange, splitClip, type TimelineSelection } from '../src/clip-editing.ts';
import { createTimelineInsertDrag } from '../src/editor/timeline-insert-drag.ts';
import { createTimelineGroupDrag } from '../src/editor/timeline-group-drag.ts';
import { createTimelineDrag } from '../src/editor/timeline-drag.ts';
import { shotEntityVisible } from '../src/scenes/camera-visibility.ts';
import { editorEntityVisible } from '../src/building/floors.ts';
import { mergeScene } from '../src/scenes/merge-project.ts';
import { applyOperations } from '../src/automation/edits.ts';
const fixture=()=>{const p=createScene('blank'),e=entity('actor','human-adult','演员',[0,0,0]);p.entities.push(e);p.duration=10;return {p,e};};
const selection=(id:string,clip='all'):TimelineSelection=>({kind:'visibility',entityId:id,id:clip});

test('legacy visibility stays all-time; intervals are half-open, master hide overrides and empty means hidden',()=>{
    const {p,e}=fixture();assertProject(p);assert.equal(entityVisibleAt(e,100),true);
    assert.deepEqual(visibilityClips(e,10),[{id:'all',start:0,end:10}]);assert.equal(e.visibility,undefined);
    e.visibility=[{id:'show',start:2,end:5}];assertProject(p);
    for(const [time,shown] of [[0,false],[2,true],[4.999,true],[5,false]] as const){
        assert.equal(entityVisibleAt(e,time),shown);assert.equal(shotEntityVisible(p,e,null,time),shown);assert.equal(editorEntityVisible(p,e,time),shown);
    }
    e.visible=false;assert.equal(entityVisibleAt(e,3),false);e.visible=true;e.visibility=[];assert.equal(entityVisibleAt(e,3),false);
    e.visibility=null;assert.equal(entityVisibleAt(e,100),true);
    const drag=createTimelineDrag(p,selection(e.id));e.locked=true;
    assert.throws(()=>drag.apply(1,true),/锁定/);assert.equal(e.visibility,null);e.locked=false;
    assert.deepEqual(JSON.parse(JSON.stringify(p)),p);
});
test('visibility rejects invalid ranges, extra fields and overlapping intervals without requiring sorted input',()=>{
    for(const bad of [[{id:'x',start:0,end:0}],[{id:'x',start:-1,end:1}],[{id:'x',start:0,end:Infinity}],
        [{id:'x',start:0,end:2},{id:'y',start:1,end:3}],[{id:'x',start:0,end:1},{id:'x',start:2,end:3}],[{id:'x',start:0,end:1,code:'extra'}]])assert.throws(()=>assertVisibility(bad));
    assert.doesNotThrow(()=>assertVisibility([{id:'b',start:2,end:3},{id:'a',start:0,end:2}]));
});
test('implicit visibility split, delete, resize and repeating drag preserve exact timing',()=>{
    const {p,e}=fixture(),s=selection(e.id);const right=splitClip(p,s,4);
    deleteClip(p,s);assert.deepEqual(e.visibility?.map(c=>[c.start,c.end]),[[4,10]]);assert.equal(entityVisibleAt(e,3),false);
    const drag=createTimelineDrag(p,right);drag.apply(-2,'start');drag.apply(-1,'start');assert.equal(clipRange(p,right).start,3);
    assert.equal(clipRange(p,right).end,10);assert.equal(p.duration,10);
    drag.apply(100,'start');assert.ok(Math.abs(clipRange(p,right).start-(10-1/p.fps))<1e-8);
    deleteClip(p,right);assert.deepEqual(e.visibility,[]);assertProject(p);
});
test('mixed visibility and action insertion shares offsets, ripple rules, and nonmutating previews',()=>{
    const {p,e}=fixture();e.visibility=[{id:'v1',start:0,end:2},{id:'v2',start:3,end:5}];
    e.clips=[{id:'a',start:3,end:5,action:'walk',speed:1}];
    const v=selection(e.id,'v2'),a:TimelineSelection={kind:'action',entityId:e.id,id:'a'};
    const before=JSON.stringify(p),drag=createTimelineInsertDrag(p,[v,a],v),plan=drag.preview(-3,.1);
    assert.equal(JSON.stringify(p),before);drag.commit(plan);
    assert.equal(clipRange(p,v).start,0);assert.equal(clipRange(p,a).start,0);assert.equal(e.visibility[0].start,2);assertProject(p);
});
test('left-edge group adjustment clamps against stationary and selected neighbours',()=>{
    const {p,e}=fixture();e.visibility=[{id:'v1',start:0,end:2},{id:'v2',start:3,end:5}];
    e.clips=[{id:'a',start:3,end:6,action:'walk',speed:1}];
    const v=selection(e.id,'v2'),a:TimelineSelection={kind:'action',entityId:e.id,id:'a'};
    createTimelineGroupDrag(p,[v,a],v).apply(-10,'start');assert.equal(clipRange(p,v).start,2);assert.equal(clipRange(p,a).start,2);assertProject(p);
    e.locked=true;assert.throws(()=>dragClipRange(p,v,1),/锁定/);assert.throws(()=>deleteClip(p,v),/锁定/);
});
test('hand-held props respect the holder schedule in staging and camera views',()=>{
    const {p,e}=fixture(),prop=entity('prop','cube','道具',[0,0,0]);p.entities.push(prop);
    prop.handBinding={actorId:e.id,hand:'right',offset:[0,0,0],rotation:[0,0,0]};e.visibility=[{id:'v',start:2,end:4}];
    assert.equal(shotEntityVisible(p,prop,null,0),false);assert.equal(editorEntityVisible(p,prop,3),true);assert.equal(shotEntityVisible(p,prop,null,4),false);
});
test('merge offsets display ranges, reset freezes initial visibility, and automation shares validation',()=>{
    const {p,e}=fixture();e.visibility=[{id:'v',start:2,end:5}];
    const options={offset:[0,0,0] as [number,number,number],timeOffset:6,scheduling:'keep' as const,cuts:'keep' as const};
    const merged=mergeScene(createScene('blank'),p,options),copy=merged.project.entities.find(x=>x.id===merged.entityIds[e.id])!;
    assert.deepEqual(copy.visibility?.map(c=>[c.start,c.end]),[[8,11]]);
    const reset=mergeScene(createScene('blank'),p,{...options,scheduling:'reset'});const frozen=reset.project.entities.find(x=>x.id===reset.entityIds[e.id])!;
    assert.equal(frozen.visible,false);assert.equal(frozen.visibility,undefined);
    const after=applyOperations(p,[{operation:'timeline',patch:{action:'split',selection:selection(e.id,'v'),time:3}}]);assert.equal(after.entities.at(-1)!.visibility?.length,2);
    const before=clone(p);assert.throws(()=>applyOperations(p,[{operation:'update',id:e.id,patch:{visibility:[{id:'v',start:0,end:-1}]}}]));assert.deepEqual(p,before);
    setClipRange(p,selection(e.id,'v'),1,4);assertProject(p);
});
