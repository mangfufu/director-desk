import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as T from 'three';
import {entity,clip} from '../src/model.ts';
import {makeHuman} from '../src/assets/humanoid.ts';
import {animateHuman} from '../src/assets/human-animation.ts';
import {disposeTree} from '../src/assets/dispose.ts';
import {geometrySignature} from './geometry-signature.ts';
import {InitialPoseRuntime} from '../src/scenes/initial-pose-runtime.ts';
import type {InitialPose} from '../src/scenes/initial-pose.ts';

test('gender changes shape while joint lengths, stature and hand attachment stay unchanged',()=>{
    const e=entity('actor','human-adult','actor'),male=makeHuman(e);e.gender='female';const female=makeHuman(e);
    assert.notEqual(geometrySignature(male.root),geometrySignature(female.root));
    assert.equal(male.referenceHeight,female.referenceHeight);assert.deepEqual(male.legLengths,female.legLengths);
    for(const name of Object.keys(male.joints))assert.deepEqual(male.joints[name].position.toArray(),female.joints[name].position.toArray());
    disposeTree(male.root);disposeTree(female.root);
});

test('continuous garments follow both legs and seek deterministically, including scene transforms',()=>{
    for(const asset of ['human-outfit-dress','human-outfit-robe']){
        const e=entity('actor',asset,asset),r=makeHuman(e),mesh=r.hips.children.find(o=>o.userData.garmentHem) as T.SkinnedMesh;
        assert.ok(mesh?.isSkinnedMesh);assert.ok(mesh.geometry.attributes.position.count<500);
        r.root.position.set(12,3,-8);r.root.rotation.y=.8;r.root.scale.multiply(new T.Vector3(1.1,.9,1.2));
        const sample=(at:number)=>{animateHuman(r,e,at);r.root.updateMatrixWorld(true);const result:number[]=[];
            for(let i=0;i<mesh.geometry.attributes.position.count;i++){const v=mesh.getVertexPosition(i,new T.Vector3()).applyMatrix4(mesh.matrixWorld);assert.ok(v.toArray().every(Number.isFinite));result.push(...v.toArray());}return result;};
        for(const action of ['walk','sit','kick','wave'] as const){e.clips=[clip(action,0,4)];const first=sample(.8);sample(3.9);sample(0);const again=sample(.8);
            assert.deepEqual(again,first,asset+'/'+action);if(action==='walk')assert.notDeepEqual(first,sample(1.1));
        }
        e.clips=[clip('idle',0,4)];const rest=sample(0),left=r.joints.leftHip;left.rotation.x=.8;r.root.updateMatrixWorld(true);
        const altered=mesh.getVertexPosition(0,new T.Vector3()).applyMatrix4(mesh.matrixWorld);assert.ok(altered.distanceTo(new T.Vector3(...rest.slice(0,3) as [number,number,number]))>.005);
        let disposed=false;
        // Skeleton owns the renderer's bone texture and must release it with the model.
        const original=mesh.skeleton.dispose.bind(mesh.skeleton);mesh.skeleton.dispose=()=>{disposed=true;original();};
        disposeTree(r.root);assert.equal(disposed,true);
    }
});

test('saved clothing continuation poses from the previous layout still apply',async()=>{
    const cases:Record<string,InitialPose>=JSON.parse(await fs.readFile(new URL('./fixtures/human-before-silhouette-poses.json',import.meta.url),'utf8'));
    for(const [asset,pose] of Object.entries(cases)){
        const e=entity('actor',asset,asset);e.initialPose=pose;const r=makeHuman(e),runtime=new InitialPoseRuntime();
        runtime.register(e,r.root);assert.equal(runtime.apply(e,0),true);assert.ok(r.joints.leftKnee.rotation.x>1);
        runtime.restore(e);assert.equal(runtime.apply(e,0),true);assert.ok(r.root.scale.y>0);disposeTree(r.root);
    }
});
