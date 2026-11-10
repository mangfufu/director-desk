import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,PerspectiveCamera,Vector3} from 'three';
import {demoProject,entity} from '../src/model.ts';
import {sampleCamera,cameraTargetPosition} from '../src/cinematography/sample-camera.ts';
import {entityPosition} from '../src/timeline.ts';

function fixture(){
    const project=demoProject(),subject=entity('actor','human-male','Subject',[2,0,0]);
    const e=entity('camera','camera','Lens',[0,1,8]);
    Object.assign(e.camera!,{mode:'free',aim:'target',targetId:subject.id,targetHeight:1,target:[0,1,0],focal:50});
    const root=new Group();root.position.fromArray(subject.position);
    project.entities=[subject,e];project.cuts=[{time:0,cameraId:e.id}];
    return {project,subject,e,root,context:{models:new Map([[subject.id,root]]),rigs:new Map()},camera:new PerspectiveCamera()};
}

test('shared camera samples paths, target height and off-axis projection without frame history',()=>{
    const {project,subject,e,root,context,camera}=fixture();
    e.path={smooth:false,points:[{time:0,position:[0,1,8]},{time:10,position:[4,2,6]}]};
    e.camera!.effects={channels:{frameX:.25,frameY:-.1,focal:70}};
    for(const time of [0,3,10,2,3]){
        sampleCamera(camera,e,project,time,context);
        assert.ok(camera.position.distanceTo(entityPosition(e,time))<1e-9);
        const expected=root.position.clone().add(new Vector3(0,1,0)).sub(camera.position).normalize();
        assert.ok(camera.getWorldDirection(new Vector3()).distanceTo(expected)<1e-9);
        assert.ok(Math.abs(camera.getFocalLength()-70)<1e-9);
        assert.equal(camera.projectionMatrix.elements[8],-.25);
        assert.equal(camera.projectionMatrix.elements[9],.1);
    }
    root.position.y=2;
    assert.equal(cameraTargetPosition(e,project,0,context.models).y,3);
    context.models.delete(subject.id);
    assert.equal(cameraTargetPosition(e,project,0,context.models).y,1);
});

test('follow camera retains shared lag and supplied physical root semantics',()=>{
    const {project,subject,e,root,context,camera}=fixture();
    subject.path={smooth:false,points:[{time:0,position:[0,0,0]},{time:10,position:[10,0,0]}]};
    root.position.set(5,0,0);
    Object.assign(e.camera!,{mode:'follow',offset:[0,2,3],inheritRotation:false,effects:{followLag:1}});
    sampleCamera(camera,e,project,5,context);
    assert.deepEqual(camera.position.toArray(),[4,2,3]);
    const physical=new Group();physical.position.set(20,4,3);physical.rotation.y=Math.PI/2;
    e.camera!.inheritRotation=true;
    let sampled=-1;
    sampleCamera(camera,e,project,5,{...context,rootAt:(_id,time)=>{sampled=time;return physical;}});
    assert.equal(sampled,4);
    assert.ok(camera.position.distanceTo(new Vector3(23,6,3))<1e-9);
});

test('POV inherits the actual posed head transform and returns to free camera cleanly',()=>{
    const {project,subject,e,root,context,camera}=fixture();
    const head=new Group();head.position.set(0,1.5,0);head.rotation.set(.2,.4,.1);root.add(head);
    Object.assign(e.camera!,{mode:'pov',offset:[0,1.6,.1],inheritRotation:true});
    const rigs=new Map([[subject.id,{head,headRestHeight:1.5}]]);
    sampleCamera(camera,e,project,0,{...context,rigs});
    assert.ok(camera.position.distanceTo(head.localToWorld(new Vector3(0,.1,.1)))<1e-9);
    assert.ok(camera.getWorldDirection(new Vector3()).distanceTo(head.getWorldDirection(new Vector3()))<1e-9);
    Object.assign(e.camera!,{mode:'free',aim:'manual',effects:{shake:{preset:'run',amount:1,frequency:1,seed:42,start:0,end:10}}});
    sampleCamera(camera,e,project,2,context);const matrix=camera.matrixWorld.toArray();
    sampleCamera(camera,e,project,8,context);sampleCamera(camera,e,project,2,context);
    assert.deepEqual(camera.matrixWorld.toArray(),matrix);
});
