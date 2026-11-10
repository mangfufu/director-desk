import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {LiteTracker,poseRotations,type Landmark} from '../src/reconstruction/lite-pose.ts';
import {buildLiteProject} from '../src/reconstruction/lite-project.ts';
import {readSceneDocument,projectForScene} from '../src/scenes/sequence-project.ts';
import {assertProject} from '../src/model.ts';
import {replaceActor} from '../src/resources/replace-actor.ts';
import {loadModelPackage} from '../src/resources/model-loader.ts';
import {assertRigBindings} from '../src/resources/rig-definition.ts';
const skeleton=()=>{
 const p:Landmark[]=Array.from({length:33},()=>({x:0,y:-.5,z:0,visibility:1}));
 for(const [id,x,y] of [[7,.08,-.65],[8,-.08,-.65],[11,.2,-.5],[12,-.2,-.5],[13,.5,-.5],[14,-.5,-.5],[15,.75,-.5],[16,-.75,-.5],[23,.1,0],[24,-.1,0],[25,.1,.43],[26,-.1,.43],[27,.1,.86],[28,-.1,.86]])p[id]={x,y,z:0,visibility:1};return p;
};
const image=(x:number)=>skeleton().map(p=>({...p,x:x+p.x*.2,y:.4+p.y*.3}));
test('lightweight tracking preserves IDs when detection order changes and expires missing people',()=>{
 const t=new LiteTracker(),world=skeleton();const a=t.update({time:0,landmarks:[image(.2),image(.7)],worldLandmarks:[world,world]},16/9);
 const b=t.update({time:.1,landmarks:[image(.69),image(.21)],worldLandmarks:[world,world]},16/9);assert.deepEqual(b.map(p=>p.id),[a[1].id,a[0].id]);
 assert.notEqual(t.update({time:2,landmarks:[image(.21)],worldLandmarks:[world]},16/9)[0].id,a[0].id);
});
test('pose fitting emits finite normalized joint rotations and reacts to raised arms',()=>{
 const p=skeleton(),rest=poseRotations(p);assert.ok(rest.every(q=>Math.abs(Math.hypot(...q)-1)<1e-6));
 p[13]={...p[13],x:.2,y:-.8};p[15]={...p[15],x:.2,y:-1.05};assert.notDeepEqual(poseRotations(p)[3],rest[3]);
 assert.throws(()=>poseRotations([]),/关键点/);
});
test('lightweight output opens as a portable project with mapped editable motion and visibility gaps',async()=>{
 // Node lacks the browser progress event used by Three.js FileLoader.
 globalThis.ProgressEvent??=class extends Event{lengthComputable=false;loaded=0;total=0;} as typeof ProgressEvent;
 const base=path.resolve('tmp/mediapipe-lite-test-20261110/unit');await fs.mkdir(base,{recursive:true});const dir=await fs.mkdtemp(path.join(base,'project-'));
 try{
  const frames=[0,.2,.6,.8].map(time=>({time,landmarks:[image(.5)],worldLandmarks:[skeleton()]}));
  await fs.writeFile(path.join(dir,'lite-analysis.json'),JSON.stringify({duration:1,aspect:16/9,analysisFps:5}));
  await fs.writeFile(path.join(dir,'lite-frames.jsonl'),frames.map(f=>JSON.stringify(f)).join('\n'));
  const result=await buildLiteProject(dir),document=readSceneDocument(JSON.parse(await fs.readFile(result.file,'utf8'))),project=projectForScene(document,document.scenes[0].id);
  assertProject(project);const actor=project.entities.find(e=>e.kind==='actor')!;assert.equal(actor.visibility!.length,2);assert.equal(actor.clips[0].action,'retarget');
  const loaded=await loadModelPackage(project.resources![0].package);try{assertRigBindings(actor.clips[0].retarget!.rig,undefined,loaded.inspection.bones);assert.equal(loaded.inspection.animations.length,1);}finally{loaded.dispose();}
  replaceActor(project,actor.id,'human-female');assert.equal(actor.clips[0].action,'retarget');assertProject(project);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
