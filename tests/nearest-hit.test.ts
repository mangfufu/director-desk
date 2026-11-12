import assert from 'node:assert/strict';
import test from 'node:test';
import * as T from 'three';
import {nearestVisibleHit} from '../src/spatial/nearest-hit.ts';

test('nearest picking matches full raycast across transformed, hidden and layered meshes',()=>{
    const scene=new T.Group(),geometry=new T.TorusKnotGeometry(.6,.15,120,12),material=new T.MeshBasicMaterial({side:T.DoubleSide});
    for(let i=0;i<100;i++){
        const m=new T.Mesh(geometry,material);m.position.set(i%10-5,Math.floor(i/10)-5,-i*.1);
        m.rotation.set(i*.13,i*.17,0);m.scale.set(1,.5+i%3,1);if(i%7===0)m.visible=false;if(i%13===0)m.layers.set(1);scene.add(m);
    }
    const hidden=new T.Group();hidden.visible=false;hidden.add(new T.Mesh(new T.BoxGeometry(30,30,1),material));hidden.position.z=4;scene.add(hidden);
    const compare=()=>{
        scene.updateMatrixWorld(true);
        for(let i=0;i<80;i++){
            const ray=new T.Raycaster(new T.Vector3(i%10-5,Math.floor(i/10)-4,10),new T.Vector3(.03,-.01,-1).normalize(),i%3,100);
            const expected=ray.intersectObjects([scene],true).find(hit=>{for(let n:T.Object3D|null=hit.object;n;n=n.parent)if(!n.visible)return false;return true;});
            const actual=nearestVisibleHit(ray,[scene]);assert.equal(actual?.object,expected?.object);
            if(actual&&expected)assert.ok(Math.abs(actual.distance-expected.distance)<1e-8);
            assert.equal(ray.far,100);
        }
    };
    compare();scene.position.set(1,2,-3);scene.rotation.y=.4;compare();geometry.dispose();material.dispose();
});

test('nearest picking retains instancing, morph deformation and rays starting inside bounds',()=>{
    const geometry=new T.BoxGeometry(),material=new T.MeshBasicMaterial({side:T.DoubleSide}),scene=new T.Group();
    const instanced=new T.InstancedMesh(geometry,material,1);instanced.setMatrixAt(0,new T.Matrix4().makeTranslation(0,0,-3));scene.add(instanced);
    const morphGeometry=geometry.clone(),position=morphGeometry.attributes.position.clone();
    for(let i=0;i<position.count;i++)position.setZ(i,position.getZ(i)-2);
    morphGeometry.morphAttributes.position=[position];
    const morph=new T.Mesh(morphGeometry,material);morph.morphTargetInfluences![0]=1;scene.add(morph);scene.updateMatrixWorld(true);
    for(const z of [3,0,-2]){
        const ray=new T.Raycaster(new T.Vector3(0,0,z),new T.Vector3(0,0,-1));
        const expected=ray.intersectObject(scene,true)[0],actual=nearestVisibleHit(ray,[scene]);
        assert.equal(actual?.object,expected?.object);assert.equal(actual?.distance,expected?.distance);
    }
    geometry.dispose();morphGeometry.dispose();material.dispose();instanced.dispose();
});
