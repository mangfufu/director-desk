import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {ShadowCache,shadowInputs,secondaryPreviewShadows} from '../src/lighting/shadow-cache.ts';

function fixture() {
    const scene=new T.Scene(),camera=new T.PerspectiveCamera(),light=new T.DirectionalLight();
    light.castShadow=true;scene.add(light,light.target);
    const mesh=new T.Mesh(new T.BoxGeometry(),new T.MeshStandardMaterial());mesh.castShadow=true;scene.add(mesh);
    return {scene,camera,light,mesh};
}
test('shadow inputs ignore camera orbit but detect transforms, visibility, light targets and cut layers',()=>{
    const {scene,camera,light,mesh}=fixture(),read=()=>shadowInputs(scene,camera,T.PCFShadowMap);
    const original=read();camera.position.set(10,5,0);camera.lookAt(0,0,0);assert.deepEqual(read(),original);
    mesh.position.x=2;assert.notDeepEqual(read(),original);mesh.position.x=0;assert.deepEqual(read(),original);
    mesh.visible=false;assert.notDeepEqual(read(),original);mesh.visible=true;
    light.target.position.x=1;assert.notDeepEqual(read(),original);light.target.position.x=0;
    camera.layers.enable(1);assert.notDeepEqual(read(),original);
});
test('shadow inputs detect geometry, morphs, skeleton poses and alpha textures',()=>{
    const {scene,camera,mesh}=fixture(),read=()=>shadowInputs(scene,camera,T.PCFShadowMap);
    let before=read();mesh.geometry.attributes.position.needsUpdate=true;assert.notDeepEqual(read(),before);
    before=read();mesh.morphTargetInfluences=[.5];assert.notDeepEqual(read(),before);
    mesh.material.alphaMap=new T.Texture();before=read();mesh.material.alphaMap.offset.x=.5;assert.notDeepEqual(read(),before);
    const bone=new T.Bone(),skin=new T.SkinnedMesh(new T.BoxGeometry(),new T.MeshStandardMaterial());
    skin.add(bone);skin.bind(new T.Skeleton([bone]));skin.castShadow=true;scene.add(skin);
    before=read();bone.rotation.z=.4;assert.notDeepEqual(read(),before);
});

test('transparent double-sided render revisions do not invalidate unchanged depth, but depth inputs do',()=>{
    const {scene,camera,mesh}=fixture(),read=()=>shadowInputs(scene,camera,T.PCFShadowMap);
    mesh.material.transparent=true;mesh.material.side=T.DoubleSide;
    const original=read();
    mesh.material.side=T.BackSide;mesh.material.needsUpdate=true;
    mesh.material.side=T.FrontSide;mesh.material.needsUpdate=true;
    mesh.material.side=T.DoubleSide;
    assert.deepEqual(read(),original);
    mesh.material.alphaToCoverage=true;assert.notDeepEqual(read(),original);
    let before=read();mesh.material.wireframe=true;assert.notDeepEqual(read(),before);
    before=read();mesh.material.side=T.FrontSide;assert.notDeepEqual(read(),before);
    mesh.customDepthMaterial=new T.MeshDepthMaterial();before=read();
    mesh.customDepthMaterial.needsUpdate=true;assert.notDeepEqual(read(),before);
});
test('each renderer warms independently; dynamic passes, failed draws and reset invalidate cached shadows',()=>{
    const {scene,camera,mesh}=fixture(),cache=new ShadowCache();
    const renderer=()=>({shadowMap:{enabled:true,type:T.PCFShadowMap,autoUpdate:true,needsUpdate:false},localClippingEnabled:false,clippingPlanes:[]}) as unknown as T.WebGLRenderer;
    const a=renderer(),b=renderer();
    const draw=(r:T.WebGLRenderer,expected:boolean,force=false)=>cache.render(r,scene,camera,()=>{
        assert.equal(force?r.shadowMap.autoUpdate:r.shadowMap.needsUpdate,expected);r.shadowMap.needsUpdate=false;
    },force);
    draw(a,true);draw(a,false);draw(b,true);draw(b,false);
    mesh.position.y=1;draw(a,true);draw(b,true);draw(a,false);
    draw(a,true,true);draw(a,true);draw(a,false);
    assert.throws(()=>cache.render(a,scene,camera,()=>{throw Error('draw failed');}),/draw failed/);draw(a,true);
    cache.clear();draw(a,true);assert.equal(a.shadowMap.autoUpdate,true);
});

test('complex interaction keeps key shadows and illumination; release and output restore every shadow',()=>{
    const {scene,camera,light,mesh}=fixture(),cache=new ShadowCache();
    const renderer={shadowMap:{enabled:true,type:T.PCFShadowMap,autoUpdate:true,needsUpdate:false},localClippingEnabled:false,clippingPlanes:[]} as unknown as T.WebGLRenderer;
    const points=Array.from({length:3},()=>{const p=new T.PointLight(0xffffff,50);p.castShadow=true;scene.add(p);return p;});
    assert.equal(secondaryPreviewShadows(scene,camera).length,0,'small scenes retain full shadows');
    for(let i=0;i<180;i++)scene.add(mesh.clone());
    assert.deepEqual(new Set(secondaryPreviewShadows(scene,camera)),new Set(points));
    cache.render(renderer,scene,camera,()=>{});
    cache.render(renderer,scene,camera,()=>{
        assert.equal(light.shadow.intensity,1);
        for(const p of points){assert.equal(p.intensity,50);assert.equal(p.castShadow,true);assert.equal(p.shadow.intensity,0);assert.equal(p.shadow.autoUpdate,false);}
    },false,true);
    for(const p of points){assert.equal(p.shadow.intensity,1);assert.equal(p.shadow.autoUpdate,true);}
    cache.render(renderer,scene,camera,()=>{assert.equal(renderer.shadowMap.needsUpdate,true);});
    cache.render(renderer,scene,camera,()=>{assert.equal(renderer.shadowMap.needsUpdate,false);});
    assert.throws(()=>cache.render(renderer,scene,camera,()=>{throw Error('failed');},false,true),/failed/);
    for(const p of points)assert.equal(p.shadow.intensity,1);
    cache.render(renderer,scene,camera,()=>{for(const p of points)assert.equal(p.shadow.intensity,1);},true,true);
    cache.render(renderer,scene,camera,()=>{});
    mesh.position.x+=1;
    cache.render(renderer,scene,camera,()=>{
        assert.equal(renderer.shadowMap.needsUpdate,false);
        assert.equal(light.shadow.intensity,1);for(const p of points)assert.equal(p.shadow.intensity,1);
    },false,true,true);
    cache.render(renderer,scene,camera,()=>assert.equal(renderer.shadowMap.needsUpdate,true));
    cache.render(renderer,scene,camera,()=>assert.equal(renderer.shadowMap.needsUpdate,false));
});
