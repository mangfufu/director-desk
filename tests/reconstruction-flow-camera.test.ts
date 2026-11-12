import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera,Vector3,Euler} from 'three';
import {entity,assertProject,type Project} from '../src/model.ts';
import {applyFlowCamera,type FlowCameraFrame} from '../src/reconstruction/flow-camera.ts';
import {sampleCamera} from '../src/cinematography/sample-camera.ts';

test('reconstructed camera preserves projection, roll, lens and independent movement on random-access frames',()=>{
    const source:PerspectiveCamera[]=[],frames:FlowCameraFrame[]=[];
    for(let i=0;i<4;i++){
        const c=new PerspectiveCamera();c.aspect=16/9;c.filmGauge=36;c.near=.025;c.far=2000;c.setFocalLength(35+i*12);c.position.set(i*.3,1.7+i*.1,5-i*.5);
        c.quaternion.setFromEuler(new Euler(.15+i*.1,.3-i*.15,.3+i*.2));c.updateMatrixWorld(true);c.updateProjectionMatrix();
        const target=c.position.clone().add(c.getWorldDirection(new Vector3())),up=new Vector3(0,1,0).applyQuaternion(c.quaternion);
        frames.push({time:i/30,position:c.position.toArray(),target:target.toArray(),up:up.toArray(),focal:35+i*12,frameX:.12,frameY:-.08});
        c.projectionMatrix.elements[8]-=.12;c.projectionMatrix.elements[9]-= -.08;source.push(c);
    }
    const camera=entity('camera','camera','camera',[0,0,0]);applyFlowCamera(camera,{fps:30,source:'fixture',frames},1);
    const project:Project={format:'director-desk',version:2,name:'test',duration:1,fps:30,aspect:'16:9',room:{enabled:false,width:10,depth:10,height:3},entities:[camera],cuts:[{time:0,cameraId:camera.id}],references:[]};
    assertProject(project);assert.equal(camera.camera!.targetId,'');assert.equal(camera.camera!.mode,'free');
    const sampled=new PerspectiveCamera();
    for(const i of [3,0,2,1]){
        sampleCamera(sampled,camera,project,i/30,{models:new Map(),rigs:new Map()});
        assert.ok(sampled.position.distanceTo(source[i].position)<1e-6);
        assert.ok(sampled.quaternion.angleTo(source[i].quaternion)<1e-6);
        const point=new Vector3(.5,1.4,0);assert.ok(point.clone().project(sampled).distanceTo(point.clone().project(source[i]))<1e-6);
    }
    sampleCamera(sampled,camera,project,1,{models:new Map(),rigs:new Map()});assert.ok(sampled.position.distanceTo(source[3].position)<1e-6);
});

test('camera adapter rejects invalid timing and directions instead of silently replacing with a wide shot',()=>{
    const frame:FlowCameraFrame={time:0,position:[0,1,5],target:[0,1,0],up:[0,1,0],focal:35,frameX:0,frameY:0};
    const camera=entity('camera','camera','camera',[0,0,0]);
    assert.throws(()=>applyFlowCamera(camera,{fps:30,source:'fixture',frames:[frame,{...frame,time:0}]},1),/时间/);
    assert.throws(()=>applyFlowCamera(camera,{fps:30,source:'fixture',frames:[{...frame,target:[...frame.position]}]},1),/方向/);
});
