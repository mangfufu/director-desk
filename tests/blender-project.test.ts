import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera,Vector3} from 'three';
import {buildBlenderProject,type BlenderScene} from '../src/import/blender-project.ts';
import {sampleCamera} from '../src/cinematography/sample-camera.ts';
import {validateToolInput} from '../src/automation/validate.ts';
import {packModelFiles} from '../src/resources/model-package.ts';
import {modelResourceId} from '../src/resources/project-resources.ts';
import {suggestHumanoidRig} from '../src/resources/rig-definition.ts';
import type {ModelInspection} from '../src/resources/model-runtime.ts';

const scene=():BlenderScene=>({version:1,name:'Scene',fps:24,duration:2,aspect:16/9,unitScale:1,warnings:[],models:[],lights:[],cuts:[{time:0,camera:'cam'}],cameras:[{id:'cam',name:'Camera',samples:[
    {time:0,position:[0,1,5],forward:[0,0,-1],up:[-.5,Math.sqrt(.75),0],verticalSpan:.45,frameX:.1,frameY:-.2},
    {time:1,position:[2,1,5],forward:[0,0,-1],up:[-1,0,0],verticalSpan:.225,frameX:.1,frameY:-.2}]}]});

test('a thin rigged blind remains an animated prop, without humanoid height restrictions',async()=>{
    const data=packModelFiles('blind.obj',[{path:'blind.obj',bytes:new TextEncoder().encode('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n')}]);
    const resource={id:await modelResourceId(data),name:'Blind',package:data,copyright:'',license:'',source:'Blender'};
    const inspection={bounds:{min:[0,0,0],max:[2,.01,1]},meshes:1,skins:1,rigSuggestion:suggestHumanoidRig([]),animations:[{index:0,name:'Open',duration:2,tracks:1}]} as ModelInspection;
    const {project}=buildBlenderProject(scene(),[{resource,inspection}]);
    const blind=project.entities.find(e=>e.name==='Blind')!;
    assert.equal(blind.kind,'prop');assert.equal(blind.clips[0].action,'native');
    assert.equal(blind.external!.unitScale,1);assert.deepEqual(blind.position,[1,0,.5]);
});

test('Blender camera preserves projected field of view, roll, location, lens shift and seconds',()=>{
    const {project}=buildBlenderProject(scene(),[]),e=project.entities[0],camera=new PerspectiveCamera();
    sampleCamera(camera,e,project,0,{models:new Map(),rigs:new Map()});
    assert.ok(Math.abs(Math.tan(camera.fov*Math.PI/360)*2-.45)<1e-8);
    assert.ok(new Vector3(0,1,0).applyQuaternion(camera.quaternion).distanceTo(new Vector3(-.5,Math.sqrt(.75),0))<1e-8);
    assert.ok(Math.abs(camera.projectionMatrix.elements[8]+.1)<1e-8);
    sampleCamera(camera,e,project,1,{models:new Map(),rigs:new Map()});
    assert.deepEqual(camera.position.toArray(),[2,1,5]);
    assert.ok(new Vector3(0,1,0).applyQuaternion(camera.quaternion).distanceTo(new Vector3(-1,0,0))<1e-8);
    assert.ok(Math.abs(Math.tan(camera.fov*Math.PI/360)*2-.225)<1e-8);
    assert.equal(project.cuts[0].cameraId,e.id);
});

test('Blender camera roll unwraps rather than spinning through zero at the +/-180 boundary',()=>{
    const s=scene();s.cameras[0].samples.forEach((sample,i)=>{const angle=(i?181:179)*Math.PI/180;sample.up=[-Math.sin(angle),Math.cos(angle),0];});
    const {project}=buildBlenderProject(s,[]),camera=new PerspectiveCamera();
    sampleCamera(camera,project.entities[0],project,.5,{models:new Map(),rigs:new Map()});
    assert.ok(new Vector3(0,1,0).applyQuaternion(camera.quaternion).y<-.999);
});

test('Blender unsupported aspect/fps reports conversion and retains source duration',()=>{
    const s=scene();s.aspect=2;s.fps=25;s.duration=1.04;
    const {project,warnings}=buildBlenderProject(s,[]);
    assert.equal(project.duration,1.04);assert.equal(project.fps,24);assert.equal(warnings.length,2);
});

test('MCP Blender import exposes executable, animation selection and both destination modes',()=>{
    assert.doesNotThrow(()=>validateToolInput('director_import',{kind:'blender',path:'/tmp/test.blend',revision:1,requestId:'import',animations:false,blenderPath:'/opt/blender/blender',mode:'merge'}));
    assert.throws(()=>validateToolInput('director_import',{kind:'blender',path:'/tmp/test.blend',revision:1,requestId:'import',animations:'yes'}));
});
