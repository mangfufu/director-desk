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
    private scene?: T.Scene;
    private nodes: T.Object3D[] = [];
    private meshes: Array<{mesh:T.Mesh; original:T.Material|T.Material[]; draft:T.Material[]}> = [];
    private dirty = true;
    private synced = new Set<T.Material>();
    private applying = false;
    private invalidate = () => { this.dirty=true; this.eligible=undefined; };
    ready(renderer:T.WebGLRenderer){return this.prepared.get(renderer)===true;}
    private index(scene:T.Scene) {
        if(this.scene===scene&&!this.dirty)return;
        this.unwatch();this.scene=scene;this.meshes=[];
        scene.traverse(node=>{
            this.nodes.push(node);
            node.addEventListener('childadded',this.invalidate);
            node.addEventListener('childremoved',this.invalidate);
            if(node instanceof T.Mesh)this.meshes.push({mesh:node,original:node.material,draft:[]});
        });
        this.dirty=false;this.eligible=undefined;
    }
    private unwatch() {
        for(const node of this.nodes){node.removeEventListener('childadded',this.invalidate);node.removeEventListener('childremoved',this.invalidate);}
        this.nodes=[];
    }
    private enabled(scene:T.Scene) {
        this.index(scene);
        if(this.eligible!==undefined)return this.eligible;
        let textured=0;
        for(const {mesh} of this.meshes)for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material])if(m instanceof T.MeshStandardMaterial && m.map)textured++;
        return this.eligible=this.meshes.length>400&&textured>200;
    }
    private material(source:T.Material) {
        if(!(source instanceof T.MeshStandardMaterial))return source;
        let target=this.materials.get(source);
        if(!target){target=new T.MeshLambertMaterial();this.materials.set(source,target);}
        if(this.synced.has(source))return target;
        this.synced.add(source);
        // Texture presence and these flags change shader variants. Values such as
        // color/opacity can animate without incrementing Material.version.
        const recompile=target.side!==source.side||target.flatShading!==source.flatShading||target.vertexColors!==source.vertexColors
            ||target.normalMapType!==source.normalMapType||!!target.alphaTest!==!!source.alphaTest
            ||(['map','alphaMap','aoMap','normalMap','bumpMap','emissiveMap'] as const).some(key=>target[key]!==source[key]);
        target.color.copy(source.color);target.emissive.copy(source.emissive);target.emissiveIntensity=source.emissiveIntensity;
        target.map=source.map;target.alphaMap=source.alphaMap;target.aoMap=source.aoMap;target.aoMapIntensity=source.aoMapIntensity;
        target.normalMap=source.normalMap;target.normalScale.copy(source.normalScale);target.normalMapType=source.normalMapType;
        target.bumpMap=source.bumpMap;target.bumpScale=source.bumpScale;target.emissiveMap=source.emissiveMap;
        target.side=source.side;target.shadowSide=source.shadowSide;target.alphaTest=source.alphaTest;
        target.opacity=source.opacity;target.transparent=source.transparent;target.depthWrite=source.depthWrite;target.depthTest=source.depthTest;
        target.vertexColors=source.vertexColors;target.flatShading=source.flatShading;target.wireframe=source.wireframe;
        target.visible=source.visible;target.toneMapped=source.toneMapped;
        if(source instanceof T.MeshPhysicalMaterial && source.transmission>0){target.transparent=true;target.opacity*=Math.max(.08,1-source.transmission);target.depthWrite=false;}
        if(recompile)target.needsUpdate=true;
        return target;
    }
    private withMaterials<R>(scene:T.Scene,draw:()=>R):R {
        if(this.applying)return draw();
        this.index(scene);this.synced.clear();
        // Keep this pass's records even if a render hook invalidates the scene.
        const meshes=this.meshes;
        for(const entry of meshes){
            const source=entry.original=entry.mesh.material;
            if(Array.isArray(source)){
                entry.draft.length=source.length;
                for(let i=0;i<source.length;i++)entry.draft[i]=this.material(source[i]);
                entry.mesh.material=entry.draft;
            }else entry.mesh.material=this.material(source);
        }
        this.applying=true;
        try{return draw();}finally{for(const {mesh,original}of meshes)mesh.material=original;this.applying=false;}
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
    clear(){this.generation++;this.unwatch();this.scene=undefined;this.meshes=[];this.dirty=true;this.synced.clear();this.materials.forEach(m=>m.dispose());this.materials.clear();this.prepared=new WeakMap();this.eligible=undefined;}
}
