import test from 'node:test';
import assert from 'node:assert/strict';
import { createScene } from '../src/scenes.ts';
import { entity } from '../src/model.ts';
import { selectionForEdit } from '../src/editor/edit-location-selection.ts';

test('AI location selects surviving intersecting clips, excluding touching boundaries',()=>{
    const p=createScene('blank'),e=entity('actor','male','人物',[0,0,0]);p.entities.push(e);p.duration=10;
    e.clips=[{id:'a',action:'idle',start:0,end:2,speed:1},{id:'b',action:'walk',start:2,end:5,speed:1},{id:'c',action:'idle',start:5,end:10,speed:1}];
    const row={entityId:e.id,name:e.name,field:'动作',action:'updated' as const,start:2,end:5};
    assert.deepEqual(selectionForEdit(p,row),{entityIds:[e.id],clips:[{kind:'action',entityId:e.id,id:'b'}],timeRange:{start:2,end:5}});
    e.clips.splice(1,1);
    assert.deepEqual(selectionForEdit(p,row).clips,[]);
    p.entities=p.entities.filter(x=>x!==e);
    assert.deepEqual(selectionForEdit(p,{...row,start:12,end:18}),{entityIds:[],clips:[],timeRange:{start:10,end:10}});
});

test('AI locations resolve path sections and camera cuts without mutating the scene',()=>{
    const p=createScene('blank'),camera=p.entities.find(e=>e.camera)!;p.duration=10;
    camera.path={smooth:false,points:[{time:0,position:[0,1,0]},{time:10,position:[0,1,10]}],sections:[{start:1,end:3,from:0,to:2},{start:5,end:9,from:2,to:10}]};
    const row={entityId:camera.id,name:camera.name,field:'运动路径',action:'updated' as const,start:5,end:9};
    const before=JSON.stringify(p);
    assert.deepEqual(selectionForEdit(p,row).clips,[{kind:'path',entityId:camera.id,index:1}]);
    assert.deepEqual(selectionForEdit(p,{...row,field:'摄影机'}).clips,[{kind:'cut',index:0}]);
    assert.equal(JSON.stringify(p),before);
    camera.visibility=[{id:'v',start:5,end:7}];
    assert.deepEqual(selectionForEdit(p,{...row,field:'显示时段'}).clips,[{kind:'visibility',entityId:camera.id,id:'v'}]);
    camera.path={smooth:false,points:[{time:6,position:[0,1,0]}]};
    assert.deepEqual(selectionForEdit(p,row),{entityIds:[camera.id],clips:[],timeRange:{start:5,end:9}});
});
