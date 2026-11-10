import test from 'node:test';
import assert from 'node:assert/strict';
import {demoProject,assertProject,entity} from '../src/model.ts';
import {applyOperations} from '../src/automation/edits.ts';
import {ProjectValidationError} from '../src/project-validation.ts';

test('shared validation identifies exact camera fields and leaves failed atomic batches unchanged',()=>{
    const p=demoProject(),camera=p.entities.find(e=>e.kind==='camera')!,index=p.entities.indexOf(camera),saved=JSON.stringify(p);
    for(const [field,value,reason] of [['focal',500,'8—300'],['target',[0,1],'三个有限数字'],['mode','orbit','free / follow / pov']] as const){
        assert.throws(()=>applyOperations(p,[{operation:'update',id:p.entities[0].id,patch:{name:'temporary'}},{operation:'update',id:camera.id,patch:{camera:{[field]:value}}}]),e=>{
            assert.ok(e instanceof ProjectValidationError);assert.equal(e.path,`entities[${index}].camera.${field}`);assert.equal(e.entityId,camera.id);assert.ok(e.message.includes(reason));return true;
        });assert.equal(JSON.stringify(p),saved);
    }
    assert.throws(()=>applyOperations(p,[{operation:'update',id:camera.id,patch:{camera:{targetId:'missing-target'}}}]),e=>{
        assert.ok(e instanceof ProjectValidationError);assert.equal(e.path,`entities[${index}].camera.targetId`);assert.match(e.message,/空字符串/);return true;
    });
});
test('unsorted clips report original array index; paths distinguish bad coordinates from time',()=>{
    const p=demoProject(),actor=p.entities.find(e=>e.kind==='actor')!,index=p.entities.indexOf(actor);
    actor.clips=[{id:'late',action:'walk',start:2,end:4,speed:1},{id:'early',action:'walk',start:0,end:3,speed:1}];
    assert.throws(()=>assertProject(p),e=>{assert.ok(e instanceof ProjectValidationError);assert.equal(e.path,`entities[${index}].clips[0].start`);assert.match(e.message,/clips\[1\].end/);return true;});
    actor.clips=[];actor.path={smooth:false,points:[{time:0,position:[0,0,0]},{time:1,position:[0,NaN,0]}]};
    assert.throws(()=>assertProject(p),e=>{assert.ok(e instanceof ProjectValidationError);assert.equal(e.path,`entities[${index}].path.points[1].position`);return true;});
    actor.path.points[1].position=[0,0,0];actor.path.points[1].time=0;
    assert.throws(()=>assertProject(p),e=>{assert.ok(e instanceof ProjectValidationError);assert.equal(e.path,`entities[${index}].path.points[1].time`);return true;});
});
test('final validation permits forward references in an atomic batch; malformed files still fail',()=>{
    const p=demoProject(),camera=p.entities.find(e=>e.kind==='camera')!;
    const next=applyOperations(p,[{operation:'update',id:camera.id,patch:{camera:{targetId:'later',mode:'follow'}}},{operation:'add',asset:'human-adult',id:'later'}]);
    assertProject(next);
    assert.throws(()=>applyOperations(p,[{operation:'project',patch:{fps:17}}]),/fps.*帧率须为/);
    const prop=entity('prop','cube','test');next.entities.push(prop);prop.scale=[1,0,1];
    assert.throws(()=>assertProject(next),/scale.*三个轴/);
    for(const input of [null,{},false,{...p,entities:[null]}])assert.throws(()=>assertProject(input));
});
