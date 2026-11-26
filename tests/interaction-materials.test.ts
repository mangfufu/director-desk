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
    previews.render(scene,renderer,true,()=>previews.render(scene,renderer,true,()=>assert.ok(mesh.material instanceof T.MeshLambertMaterial)));
    assert.equal(mesh.material,material,'nested rendering restores the original surface');
    previews.render(scene,renderer,false,()=>assert.equal(mesh.material,material));
    assert.throws(()=>previews.render(scene,renderer,true,()=>{throw Error('draw');}),/draw/);assert.equal(mesh.material,material);
    previews.clear();previews.render(scene,renderer,true,()=>assert.equal(mesh.material,material));
    geometry.dispose();material.dispose();map.dispose();
});

test('shared materials sync once per pass, topology and material changes remain editable',async()=>{
    const scene=new T.Scene(),geometry=new T.BoxGeometry(),source=new T.MeshStandardMaterial({map:new T.Texture()});
    const group=new T.Group();scene.add(group);
    for(let i=0;i<401;i++)group.add(new T.Mesh(geometry,source));
    const previews=new InteractionMaterials(),renderer={compileAsync:async()=>{}} as unknown as T.WebGLRenderer;
    previews.prepare(scene,renderer,new T.PerspectiveCamera());await Promise.resolve();
    const mesh=group.children[0] as T.Mesh;let copies=0;
    previews.render(scene,renderer,true,()=>{
        const target=mesh.material as T.MeshLambertMaterial,copy=target.color.copy;
        target.color.copy=function(color){copies++;return copy.call(this,color);};
    });
    source.color.set('#336699');
    previews.render(scene,renderer,true,()=>assert.equal((mesh.material as T.MeshLambertMaterial).color.getHexString(),'336699'));
    assert.equal(copies,1,'one color copy for 401 shared meshes');
    const added=new T.Mesh(geometry,[source,source]);group.add(added);
    const original=added.material;let array:T.Material[]|undefined;
    previews.render(scene,renderer,true,()=>{array=added.material;assert.ok(array[0] instanceof T.MeshLambertMaterial);});
    previews.render(scene,renderer,true,()=>assert.equal(added.material,array,'reuse draft array'));
    assert.equal(added.material,original);
    const replacement=new T.MeshStandardMaterial({color:'#ff0000'});original[1]=replacement;
    previews.render(scene,renderer,true,()=>assert.equal((added.material[1] as unknown as T.MeshLambertMaterial).color.getHexString(),'ff0000'));
    group.remove(added);
    previews.render(scene,renderer,true,()=>assert.equal(added.material,original));
    previews.clear();previews.render(scene,renderer,true,()=>assert.equal(mesh.material,source));
    source.map!.dispose();geometry.dispose();source.dispose();replacement.dispose();
});
