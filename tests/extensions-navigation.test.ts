import test from 'node:test';
import assert from 'node:assert/strict';
import { createScene } from '../src/scenes.ts';
import { entity, clip, assertProject, type MotionPath } from '../src/model.ts';
import { Matrix4, Euler, Quaternion, Vector3 } from 'three';
import { entityPosition, entityYaw } from '../src/timeline.ts';
import { applyOperations } from '../src/automation/edits.ts';
import { planNavigation, findGroundRoute, routesConflict } from '../src/navigation/planner.ts';
import { memberSample } from '../src/navigation/member-paths.ts';
import { SceneSession } from '../src/scenes/sequence-session.ts';
import { assertExtensionPackage } from '../src/plugins/extension-package.ts';
import { identifyImportedDocument } from '../src/versions/identity.ts';
import { readSceneDocument } from '../src/scenes/sequence-project.ts';

test('ground route goes around an expanded obstacle, rejects blocked endpoints and sealed exits',()=>{
    const route=findGroundRoute([-4,0],[4,0],[[-1,-1,1,1]],[],.35);
    assert.ok(route.length>2);assert.deepEqual(route[0],[-4,0]);assert.deepEqual(route.at(-1),[4,0]);
    for(let i=1;i<route.length;i++)for(let u=0;u<=1;u+=.01){const x=route[i-1][0]+(route[i][0]-route[i-1][0])*u,z=route[i-1][1]+(route[i][1]-route[i-1][1])*u;assert.ok(!(x>=-1&&x<=1&&z>=-1&&z<=1));}
    assert.throws(()=>findGroundRoute([0,0],[4,0],[[-1,-1,1,1]],[],.35),/占用/);
    assert.throws(()=>findGroundRoute([-4,0],[4,0],[[-1,-100,1,100]],[],.35),/没有找到/);
});
test('continuous route conflict catches crossing between samples, stationary holds and opposite directions',()=>{
    const p=(a:[number,number,number],b:[number,number,number],start=0,end=1):MotionPath=>({smooth:false,points:[{time:start,position:a},{time:end,position:b}]});
    assert.equal(routesConflict(p([-5,0,0],[5,0,0]),p([0,0,-5],[0,0,5]),0,1,.35),true);
    assert.equal(routesConflict(p([-5,0,0],[5,0,0]),p([5,0,0],[-5,0,0]),0,1,.35),true);
    assert.equal(routesConflict(p([-5,0,0],[5,0,0]),p([-5,0,2],[5,0,2]),0,1,.35),false);
    assert.equal(routesConflict(p([-5,0,0],[5,0,0],2,3),p([0,0,0],[0,0,0]),0,4,.35),true);
});
test('crowd plans independent routes, survive validation and random seeking, original is unchanged',()=>{
    const project=createScene('blank'),crowd=entity('crowd','crowd','Crowd',[-4,0,0]);crowd.count=4;crowd.spacing=1.5;project.entities.push(crowd);
    const before=JSON.stringify(project);
    const result=planNavigation(project,{entityIds:[crowd.id],destination:[4,0,0],start:0,end:30,bounds:{block:{min:[-.5,0,-.7],max:[.5,2,.7]}}});
    assert.equal(result.people,4);assert.equal(JSON.stringify(project),before);
    const next=applyOperations(project,result.operations);assertProject(next);
    const e=next.entities.find(e=>e.id===crowd.id)!;assert.equal(e.memberPaths!.length,4);
    const sample=memberSample(e,0,3).position.toArray();memberSample(e,0,29);memberSample(e,0,0);assert.deepEqual(memberSample(e,0,3).position.toArray(),sample);
    for(let i=0;i<4;i++)for(let j=0;j<i;j++)assert.equal(routesConflict(e.memberPaths![i],e.memberPaths![j],0,30,.35),false);
    e.count=3;assert.throws(()=>assertProject(next),/路线数量/);
});
test('navigation rejects locks, overlaps, height changes and insufficient time without mutation',()=>{
    const p=createScene('blank'),a=entity('actor','human-adult','A',[-3,0,0]);p.entities.push(a);
    const options={entityIds:[a.id],destination:[3,0,0] as [number,number,number],start:0,end:10,bounds:{}};
    a.locked=true;assert.throws(()=>planNavigation(p,options),/锁定/);a.locked=false;
    assert.throws(()=>planNavigation(p,{...options,end:.1}),/指定时段/);
    assert.throws(()=>planNavigation(p,{...options,destination:[3,1,0]}),/高度/);
    const b=entity('actor','human-adult','B',[-3,0,0]);p.entities.push(b);assert.throws(()=>planNavigation(p,{...options,entityIds:[a.id,b.id]}),/过密/);
});
test('project identity survives editing, serialization and undo; fresh projects get independent IDs',()=>{
    const s=new SceneSession(createScene('blank')),id=s.projectId;
    const token=s.begin();token.project.name='Changed';s.commit(token);assert.equal(s.projectId,id);
    const loaded=new SceneSession(JSON.parse(JSON.stringify(s.exportDocument())));assert.equal(loaded.projectId,id);
    const other=new SceneSession(createScene('blank'));assert.notEqual(other.projectId,id);
    s.replace(other.exportDocument(),s.context,'new');assert.equal(s.projectId,other.projectId);s.undo();assert.equal(s.projectId,id);
});
test('extension package validates portable files and declared native entry',()=>{
    const p={format:'director-plugin',apiVersion:2,id:'example',name:'Example',version:'1',permissions:['editor'],commands:[],entry:'index.js',files:{'index.js':{encoding:'utf8',data:'export function activate(){}'}}};
    assert.doesNotThrow(()=>assertExtensionPackage(p));
    assert.throws(()=>assertExtensionPackage({...p,files:{'../outside.js':{encoding:'utf8',data:''}}}));
    assert.throws(()=>assertExtensionPackage({...p,backend:'native.cjs'}));
    assert.throws(()=>assertExtensionPackage({...p,id:undefined}));
});
test('legacy file identity remains stable across opens without conflating new projects',async()=>{
    const doc=readSceneDocument(createScene('blank'));
    const a=await identifyImportedDocument(structuredClone(doc)),b=await identifyImportedDocument(structuredClone(doc));
    assert.equal(a.projectId,b.projectId);
    const changed=structuredClone(doc);changed.name='Other';assert.notEqual((await identifyImportedDocument(changed)).projectId,a.projectId);
    assert.equal((await identifyImportedDocument({...doc,projectId:'saved-identity'})).projectId,'saved-identity');
});

test('crowd routing preserves supplied world starts with scale and completed turns',()=>{
    const p=createScene('blank'),e=entity('crowd','crowd','Crowd',[1,0,2]);e.count=2;e.scale=[1.5,1,1.5];e.rotation=[0,.4,0];
    const turn=clip('turn',0,1);turn.turnAmount=.5;e.clips=[turn];p.entities.push(e);
    const starts:[number,number,number][]=[[-4,0,-1],[-3,0,1]];
    const result=planNavigation(p,{entityIds:[e.id],destination:[4,0,0],start:2,end:20,bounds:{},startingPositions:{[e.id]:starts}});
    const next=applyOperations(p,result.operations);assertProject(next);const routed=next.entities.find(v=>v.id===e.id)!;
    const world=(i:number,t:number)=>memberSample(routed,i,t).position.applyMatrix4(new Matrix4().compose(entityPosition(routed,t),new Quaternion().setFromEuler(new Euler(0,entityYaw(routed,t,next),0)),new Vector3(...routed.scale)));
    for(let i=0;i<2;i++){
        assert.ok(world(i,2).distanceTo(new Vector3(...starts[i]))<1e-8);
        assert.ok(world(i,20).distanceTo(new Vector3(starts[i][0]+7.5,0,starts[i][2]))<1e-8);
    }
});
