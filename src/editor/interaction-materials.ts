import * as T from 'three';

/** Prepared, temporary shaded materials for interaction in texture-heavy scenes.
 * Color/UV/alpha/normal maps stay intact; costly refraction and specular layers
 * return on release. Neither the loaded model nor the project is modified.
 */
export class InteractionMaterials {
    private materials = new Map<T.Material,T.MeshLambertMaterial>();
    private prepared = new WeakMap<T.WebGLRenderer, boolean>();
    private generation = 0;
    private eligible: boolean | undefined;
    ready(renderer:T.WebGLRenderer){return this.prepared.get(renderer)===true;}
    private enabled(scene:T.Scene) {
        if(this.eligible!==undefined)return this.eligible;
        let meshes=0,textured=0;
        scene.traverse(n=>{if(n instanceof T.Mesh){meshes++;for(const m of Array.isArray(n.material)?n.material:[n.material])if(m instanceof T.MeshStandardMaterial && m.map)textured++;}});
        return this.eligible=meshes>400&&textured>200;
    }
    private material(source:T.Material) {
        if(!(source instanceof T.MeshStandardMaterial))return source;
        let target=this.materials.get(source);
        if(!target){target=new T.MeshLambertMaterial();this.materials.set(source,target);}
        target.color.copy(source.color);target.emissive.copy(source.emissive);target.emissiveIntensity=source.emissiveIntensity;
        target.map=source.map;target.alphaMap=source.alphaMap;target.aoMap=source.aoMap;target.aoMapIntensity=source.aoMapIntensity;
        target.normalMap=source.normalMap;target.normalScale.copy(source.normalScale);target.normalMapType=source.normalMapType;
        target.bumpMap=source.bumpMap;target.bumpScale=source.bumpScale;target.emissiveMap=source.emissiveMap;
        target.side=source.side;target.shadowSide=source.shadowSide;target.alphaTest=source.alphaTest;
        target.opacity=source.opacity;target.transparent=source.transparent;target.depthWrite=source.depthWrite;target.depthTest=source.depthTest;
        target.vertexColors=source.vertexColors;target.flatShading=source.flatShading;target.wireframe=source.wireframe;
        target.visible=source.visible;target.toneMapped=source.toneMapped;
        if(source instanceof T.MeshPhysicalMaterial && source.transmission>0){target.transparent=true;target.opacity*=Math.max(.08,1-source.transmission);target.depthWrite=false;}
        return target;
    }
    private withMaterials<R>(scene:T.Scene,draw:()=>R):R {
        const originals=new Map<T.Mesh,T.Material|T.Material[]>();
        scene.traverse(n=>{if(n instanceof T.Mesh){originals.set(n,n.material);n.material=Array.isArray(n.material)?n.material.map(m=>this.material(m)):this.material(n.material);}});
        try{return draw();}finally{for(const [mesh,material]of originals)mesh.material=material;}
    }
    prepare(scene:T.Scene,renderer:T.WebGLRenderer,camera:T.Camera) {
        if(!this.enabled(scene)||this.prepared.has(renderer))return;
        const generation=this.generation;this.prepared.set(renderer,false);
        try{
            const pending=this.withMaterials(scene,()=>renderer.compileAsync(scene,camera));
            void pending.then(()=>{if(generation===this.generation)this.prepared.set(renderer,true);},()=>{if(generation===this.generation)this.prepared.delete(renderer);});
        }catch{this.prepared.delete(renderer);}
    }
    render<R>(scene:T.Scene,renderer:T.WebGLRenderer,active:boolean,draw:()=>R):R {
        return active&&this.prepared.get(renderer)?this.withMaterials(scene,draw):draw();
    }
    clear(){this.generation++;this.materials.forEach(m=>m.dispose());this.materials.clear();this.prepared=new WeakMap();this.eligible=undefined;}
}
