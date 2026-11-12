import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {flowMotionResource,buildFlowProject,type FlowPerson} from '../src/reconstruction/flow-project.ts';
import {readSceneDocument,projectForScene} from '../src/scenes/sequence-project.ts';
import {assertProject} from '../src/model.ts';
import {replaceActor} from '../src/resources/replace-actor.ts';
import {loadModelPackage} from '../src/resources/model-loader.ts';
import {assertRigBindings} from '../src/resources/rig-definition.ts';

function person():FlowPerson{
 const parents=[-1,0,0,0,1,2,3,4,5,6,7,8,9,9,9,12,13,14,16,17,18,19,...Array(15).fill(20),...Array(15).fill(21)];
 const rest=[[0,1,0],[.1,.95,0],[-.1,.95,0],[0,1.1,0],[.1,.5,0],[-.1,.5,0],[0,1.3,0],[.1,.1,0],[-.1,.1,0],[0,1.5,0],[.1,.1,.15],[-.1,.1,.15],[0,1.6,0],[.1,1.5,0],[-.1,1.5,0],[0,1.8,0],[.2,1.5,0],[-.2,1.5,0],[.5,1.5,0],[-.5,1.5,0],[.8,1.5,0],[-.8,1.5,0],...Array.from({length:30},(_,i)=>[i<15?.85:-.85,1.5,.01*i])];
 return {id:0,start:.5,end:.7,parents,rest,translations:Array.from({length:6},(_,i)=>[i*.2,i*.1,0]),rotations:Array.from({length:6},()=>Array.from({length:52},()=>[0,0,0,1]))};
}
test('FlowHMR produces portable mapped motion, independent root path, visibility and editable replacement',async()=>{
 globalThis.ProgressEvent??=class extends Event{lengthComputable=false;loaded=0;total=0;} as typeof ProgressEvent;
 const base=path.resolve('tmp/flowhmr-integration/tests');await fs.mkdir(base,{recursive:true});const dir=await fs.mkdtemp(path.join(base,'motion-'));
 try{
  const source=person();source.rotations[3][18]=[0,0,Math.sin(.4),Math.cos(.4)];
  await fs.writeFile(path.join(dir,'flow-motion.json'),JSON.stringify({version:1,fps:30,duration:1,aspect:16/9,people:[source]}));
  const result=await buildFlowProject(dir),doc=readSceneDocument(JSON.parse(await fs.readFile(result.file,'utf8'))),p=projectForScene(doc,doc.scenes[0].id);
  assertProject(p);const a=p.entities.find(e=>e.kind==='actor')!;
  assert.equal(a.clips[0].start,.5);assert.equal(a.clips[0].offset,.5);assert.equal(a.clips[0].end,.7);assert.equal(a.path!.points.at(-1)!.position[0],1);assert.equal(a.visibility![0].start,.5);
  const loaded=await loadModelPackage(p.resources![0].package);
  try{
   assertRigBindings(a.clips[0].retarget!.rig,undefined,loaded.inspection.bones);
   assert.equal(loaded.inspection.animations.length,1);
   const instance=loaded.instantiate();
   try{
    instance.sampleAnimation(0,.5);const start=instance.bonePosition(a.clips[0].retarget!.rig.bones.hips!);
    instance.sampleAnimation(0,.65);const end=instance.bonePosition(a.clips[0].retarget!.rig.bones.hips!);
    assert.equal(start.x,0);assert.equal(end.x,0);assert.equal(end.z,0);assert.ok(end.y>start.y+.4);
   }finally{instance.dispose();}
  }finally{loaded.dispose();}
  replaceActor(p,a.id,'human-female');assertProject(p);assert.equal(a.clips[0].action,'retarget');assert.equal(a.path!.points.length,6);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('FlowHMR rejects broken skeletons, invalid motion and invalid timing',()=>{
 let p=person();p.parents[2]=2;assert.throws(()=>flowMotionResource(p,30),/骨架/);
 p=person();p.rotations[2][0]=[0,0,0,0];assert.throws(()=>flowMotionResource(p,30),/动作/);
 p=person();p.translations[2][1]=NaN;assert.throws(()=>flowMotionResource(p,30),/动作/);
});

test('FlowHMR preserves all detected people beyond the former ten-person limit',async()=>{
 const base=path.resolve('tmp/flowhmr-integration/tests');await fs.mkdir(base,{recursive:true});const dir=await fs.mkdtemp(path.join(base,'crowd-'));
 try{
  await fs.writeFile(path.join(dir,'flow-motion.json'),JSON.stringify({version:1,fps:30,duration:1,aspect:16/9,people:Array.from({length:12},(_,id)=>({...person(),id}))}));
  const result=await buildFlowProject(dir),doc=readSceneDocument(JSON.parse(await fs.readFile(result.file,'utf8'))),p=projectForScene(doc,doc.scenes[0].id);
  assertProject(p);assert.equal(p.entities.filter(e=>e.kind==='actor').length,12);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
