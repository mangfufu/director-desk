import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { assertProject,demoProject,entity,clone,type Entity } from '../src/model.ts';
import { defaultPhysicsBody,defaultPhysicsWorld } from '../src/physics/model.ts';
import { PhysicsRuntime } from '../src/physics/runtime.ts';
import { rigPhysicsBones } from '../src/physics/ragdoll.ts';
import { makeHuman,scaleHuman } from '../src/assets/humanoid.ts';
import { animateHuman } from '../src/assets/human-animation.ts';
import { entityPosition } from '../src/timeline.ts';
import { applyOperations } from '../src/automation/edits.ts';
import { transformEntities } from '../src/building/group-editing.ts';
import { mergeScene } from '../src/scenes/merge-project.ts';
import { readSceneDocument,projectForScene } from '../src/scenes/sequence-project.ts';

function harness(actors:Entity[],human=false){
    const p=demoProject();p.room.enabled=false;p.entities=[...p.entities.filter(e=>e.camera).slice(0,1),...actors];p.cuts=[{time:0,cameraId:p.entities[0].id}];p.duration=20;p.physics=defaultPhysicsWorld();
    const scene=new T.Scene(),models=new Map<string,T.Group>(),rigs=new Map<string,ReturnType<typeof makeHuman>>();
    for(const e of actors){const root=new T.Group();
        if(human){const r=makeHuman(e);rigs.set(e.id,r);models.set(e.id,r.root);scene.add(r.root);continue;}
        const mesh=new T.Mesh(new T.BoxGeometry(.5,.5,.5));mesh.position.y=.25;root.add(mesh);models.set(e.id,root);scene.add(root);}
    const runtime=new PhysicsRuntime(models,e=>rigs.has(e.id)?rigPhysicsBones(rigs.get(e.id)!):undefined,()=>new T.Group());
    const baseline=(time:number)=>{runtime.restore();for(const e of actors){const root=models.get(e.id)!;root.position.copy(entityPosition(e,time));root.rotation.set(...e.rotation);root.scale.fromArray(e.scale);
        if(human){scaleHuman(rigs.get(e.id)!,e);animateHuman(rigs.get(e.id)!,e,time);} }scene.updateMatrixWorld(true);};
    const sample=(time:number)=>{baseline(time);runtime.sample(p,time,baseline);scene.updateMatrixWorld(true);return actors.map(e=>models.get(e.id)!.position.toArray());};
    return {p,runtime,sample,models,rigs};
}
const body=(position:[number,number,number]=[0,3,0])=>{const e=entity('prop','cube','物体',position);e.physics=defaultPhysicsBody();return e;};

test('shipped offline tool retains physics defaults, action choices and atomic validation',async()=>{
    const tool=await import(new URL('../skills/director-desk/scripts/project-tool.mjs',import.meta.url).href);
    const project=tool.createScene('blank'),before=JSON.stringify(project);
    const operations=[{operation:'project',patch:{physics:tool.defaultPhysicsWorld()}},
        {operation:'add',id:'human',asset:'human-adult',patch:{physics:{...tool.defaultPhysicsBody(),mass:60,ragdoll:true},clips:[tool.clip('flying-kick',0,1)]}}];
    const updated=tool.applyOperations(project,operations);tool.assertProject(JSON.parse(JSON.stringify(updated)));
    assert.equal(updated.entities.find((e:Entity)=>e.id==='human').physics.ragdoll,true);
    assert.equal(tool.ACTIONS['roundhouse'],'回旋踢');assert.equal(JSON.stringify(project),before);
    assert.throws(()=>tool.applyOperations(project,[...operations,{operation:'update',id:'human',patch:{physics:{...tool.defaultPhysicsBody(),mass:-1}}}]));
    assert.equal(JSON.stringify(project),before);
});
test('gravity, ground contact and random seek repeat the same world transforms',()=>{
    const e=body(),h=harness([e]);const end=h.sample(3);assert.ok(Math.abs(end[0][1])<.04);h.sample(.2);assert.deepEqual(h.sample(3),end);
    const fresh=harness([clone(e)]);assert.deepEqual(fresh.sample(3),end);h.p.physics!.enabled=false;assert.deepEqual(h.sample(3)[0],e.position);
});
test('independent gravity/collision switches, timed impulses and mass scaling',()=>{
    const e=body();e.physics!.gravity=false;e.physics!.damping=0;e.physics!.mass=2;e.physics!.impulses=[{time:1,impulse:[4,0,0],point:[0,0,0]}];
    const h=harness([e]);assert.deepEqual(h.sample(.9)[0],[0,3,0]);assert.ok(Math.abs(h.sample(2)[0][0]-2)<.03);assert.equal(h.sample(2)[0][1],3);
    e.physics!.gravity=true;e.physics!.collisions=false;assert.ok(h.sample(2)[0][1]<0);
});
test('inertia inherits path travel at release and can be disabled',()=>{
    const e=body([0,2,0]);e.path={smooth:false,points:[{time:0,position:[0,2,0]},{time:2,position:[4,2,0]}]};e.physics!.start=1;e.physics!.gravity=false;e.physics!.damping=0;
    const h=harness([e]);assert.ok(Math.abs(h.sample(.5)[0][0]-1)<.02);assert.ok(h.sample(2)[0][0]>3.95);
    e.physics!.inertia=false;assert.ok(Math.abs(h.sample(2)[0][0]-2)<.03);
});
test('static obstacles and driven moving obstacles transfer collision response',()=>{
    const a=body([0,2,0]),wall=body([2,2,0]);a.physics!.gravity=false;a.physics!.velocity=[5,0,0];wall.physics!.mode='static';
    const h=harness([a,wall]);assert.ok(h.sample(1)[0][0]<1.6,'box cannot cross the obstacle');
    wall.physics!.collisions=false;assert.ok(h.sample(1)[0][0]>4);
});
test('ragdoll limbs remain finite, constrained and deterministic after falling',()=>{
    const e=entity('actor','human-adult','人物',[0,2,0]);e.physics={...defaultPhysicsBody(),mass:60,ragdoll:true,impulses:[{time:.2,impulse:[30,20,5],point:[0,.1,0]}]};
    const h=harness([e],true);h.sample(4);const rig=h.rigs.get(e.id)!,state=()=>Object.values(rigPhysicsBones(rig)).filter(Boolean).flatMap(node=>node!.matrixWorld.toArray());
    const end=state();assert.ok(end.every(Number.isFinite));assert.ok(rig.hips.getWorldPosition(new T.Vector3()).y<1);
    assert.ok(rig.joints.rightKnee.getWorldPosition(new T.Vector3()).distanceTo(rig.joints.rightHip.getWorldPosition(new T.Vector3()))<.7);
    for(const side of ['left','right']){
        const distance=(a:string,b:string)=>rig.joints[side+a].getWorldPosition(new T.Vector3()).distanceTo(rig.joints[side+b].getWorldPosition(new T.Vector3()));
        assert.ok(Math.abs(distance('Hip','Knee')-rig.legLengths!.upper*rig.root.scale.y)<1e-6,'ragdoll must not stretch its thigh');
        assert.ok(Math.abs(distance('Knee','Ankle')-rig.legLengths!.lower*rig.root.scale.y)<1e-6,'ragdoll must not separate its knee/ankle');
    }
    h.sample(.4);h.sample(4);assert.deepEqual(state(),end);h.runtime.invalidate();h.sample(4);assert.deepEqual(state(),end);
});
test('physics validation rejects unsupported targets and invalid events without changing the project',()=>{
    const h=harness([body()]);assertProject(h.p);const e=h.p.entities[1];e.physics!.impulses=[{time:1,impulse:[0,1,0],point:[0,0,0]},{time:0,impulse:[0,1,0],point:[0,0,0]}];assert.throws(()=>assertProject(h.p),/受力/);
    e.physics!.impulses=[];e.physics!.ragdoll=true;assert.throws(()=>assertProject(h.p),/人形/);
    e.physics!.ragdoll=false;e.handBinding={actorId:'no',hand:'left',offset:[0,0,0],rotation:[0,0,0]};assert.throws(()=>assertProject(h.p),/绑定/);
});

test('floor contacts respect an object zero friction and restitution settings',()=>{
    const glider=body([0,0,0]);glider.physics={...defaultPhysicsBody(),gravity:false,damping:0,friction:0,impulses:[{time:1,impulse:[4,0,0],point:[0,0,0]}]};
    const h=harness([glider]);assert.ok(h.sample(2)[0][0]>3.9,'the ground must not override zero friction');
    const bouncing=body([0,2,0]);bouncing.physics={...defaultPhysicsBody(),damping:0,friction:0,restitution:.8};
    const bounce=harness([bouncing]);const height=bounce.sample(1)[0][1];assert.ok(height>.6,'configured bounce returns above the floor');
    bouncing.physics.restitution=0;assert.ok(bounce.sample(1)[0][1]<.04);
});
test('a driven obstacle pushes another body and remains attached to its path',()=>{
    const a=body([1,2,0]),driver=body([-1,2,0]);a.physics!.gravity=false;a.physics!.damping=0;driver.physics!.mode='kinematic';
    driver.path={smooth:false,points:[{time:0,position:[-1,2,0]},{time:1,position:[2,2,0]}]};
    const h=harness([a,driver]);const state=h.sample(1);assert.ok(state[0][0]>2.2);assert.equal(state[1][0],2);
    driver.physics!.mode='static';const solo=harness([driver]);assert.deepEqual(solo.sample(1)[0],[-1,2,0]);
});
test('scene storage, batch transactions, rotated impulses and merge scheduling use the shared contract',()=>{
    const h=harness([body()]),e=h.p.entities[1];e.id='test';e.physics!.impulses=[{time:2,impulse:[4,0,0],point:[0,0,.2]}];
    const next=applyOperations(h.p,[{operation:'project',patch:{physics:{...defaultPhysicsWorld(),gravity:[0,-3,0]}}},{operation:'update',id:'test',patch:{physics:{...e.physics!,mass:4}}}]);
    assert.equal(next.entities[1].physics!.mass,4);assert.equal(e.physics!.mass,1);const document=readSceneDocument(next);assert.deepEqual(projectForScene(document).physics,next.physics);
    assert.throws(()=>applyOperations(h.p,[{operation:'update',id:'test',patch:{physics:{...e.physics!,mass:2}}},{operation:'update',id:'test',patch:{physics:{...e.physics!,mass:-1}}}]));assert.equal(e.physics!.mass,1);
    transformEntities(next,['test'],{rotation:[0,Math.PI/2,0]});assert.ok(Math.abs(next.entities[1].physics!.impulses[0].impulse[2]+4)<1e-6);
    const merged=mergeScene(demoProject(),next,{offset:[2,0,0],timeOffset:3,scheduling:'keep',cuts:'keep'});const added=merged.project.entities.find(x=>x.id===merged.entityIds.test)!;assert.equal(added.physics!.start,3);assert.equal(added.physics!.impulses[0].time,5);
    const reset=mergeScene(demoProject(),next,{offset:[0,0,0],timeOffset:0,scheduling:'reset',cuts:'keep'}).project.entities.find(x=>x.physics)!;assert.equal(reset.physics!.enabled,false);assert.deepEqual(reset.physics!.impulses,[]);
});
