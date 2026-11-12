import assert from 'node:assert/strict';
import test from 'node:test';
import * as T from 'three';
import {InteractionMaterials} from '../src/editor/interaction-materials.ts';

test('prepared interaction materials preserve textures and restore full surfaces on release, output and errors',async()=>{
    const scene=new T.Scene(),map=new T.Texture(),material=new T.MeshPhysicalMaterial({map,normalMap:map,color:'#a06030',transmission:1});
    const geometry=new T.BoxGeometry();for(let i=0;i<401;i++)scene.add(new T.Mesh(geometry,material));
    let compiled=false;
    const renderer={compileAsync:async(s:T.Scene)=>{assert.ok((s.children[0] as T.Mesh).material instanceof T.MeshLambertMaterial);compiled=true;}} as unknown as T.WebGLRenderer;
    const previews=new InteractionMaterials(),camera=new T.PerspectiveCamera();
    previews.prepare(scene,renderer,camera);await Promise.resolve();assert.equal(compiled,true);
    const mesh=scene.children[0] as T.Mesh;
    assert.equal(mesh.material,material);
    previews.render(scene,renderer,true,()=>{
        const simplified=mesh.material as T.MeshLambertMaterial;
        assert.ok(simplified instanceof T.MeshLambertMaterial);assert.equal(simplified.map,map);assert.equal(simplified.normalMap,map);
        assert.equal(simplified.color.getHexString(),material.color.getHexString());assert.equal(simplified.transparent,true);
    });
    assert.equal(mesh.material,material);assert.equal(material.transmission,1);
    previews.render(scene,renderer,false,()=>assert.equal(mesh.material,material));
    assert.throws(()=>previews.render(scene,renderer,true,()=>{throw Error('draw');}),/draw/);assert.equal(mesh.material,material);
    previews.clear();previews.render(scene,renderer,true,()=>assert.equal(mesh.material,material));
    geometry.dispose();material.dispose();map.dispose();
});
