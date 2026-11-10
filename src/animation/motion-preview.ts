import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ModelMotion } from '../resources/model-motion.ts';
import type { LoadedModel, ModelInstance } from '../resources/model-runtime.ts';
import { entity, clone } from '../model.ts';
import { makeHuman } from '../assets/humanoid.ts';
import { disposeTree } from '../assets/dispose.ts';
import { builtinHumanoidSkeleton } from './builtin-humanoid.ts';
import { RetargetRuntime } from './retarget-runtime.ts';
import { rigStatus, type HumanBone } from '../resources/rig-definition.ts';
import { nativeSourceTime } from '../resources/native-animation.ts';
import type { UserMotion } from './user-motion.ts';

export type MotionPreviewView = 'source' | 'human';
export interface MotionPreviewState {
    time: number; sourceTime: number; view: MotionPreviewView;
    leftFoot: number | null; rightFoot: number | null;
    displacement: [number, number, number];
}
/** Disposable, seekable calibration preview. Uses the production retarget evaluator. */
export class MotionPreview {
    private renderer = new T.WebGLRenderer({ antialias: true });
    private scene = new T.Scene();
    private camera = new T.PerspectiveCamera(40, 1, .01, 10000);
    private controls!: OrbitControls;
    private instance!: ModelInstance;
    private motion!: ModelMotion;
    private skeleton?: T.SkeletonHelper;
    private runtime?: RetargetRuntime;
    private target = entity('actor', 'human-adult', '默认人物');
    private human?: ReturnType<typeof makeHuman>;
    private targetBones?: ReturnType<typeof builtinHumanoidSkeleton>['bones'];
    private hipOrigin = new T.Vector3();
    private sourceDuration = 1;
    private sourceBones: string[] = [];
    private grid = new T.GridHelper(10, 20, '#555555', '#333333');
    private marker = new T.Mesh(new T.SphereGeometry(.025, 12, 8), new T.MeshBasicMaterial({color:'#ffffff',depthTest:false}));
    private bonePath = '';
    private frame = 0;
    private elapsed = 0;
    private previous = 0;
    private width = 0;
    private height = 0;
    private notified = -Infinity;
    private dirty = true;
    playing = true;
    readonly view: MotionPreviewView;
    constructor(private host: HTMLElement, model: LoadedModel, private entry: UserMotion, view: MotionPreviewView = 'source', private onFrame?: (state: MotionPreviewState) => void, private maxFps = 60) {
        this.view = view;
        try {
            this.sourceDuration=model.inspection.animations.find(a=>a.index===entry.data.index)!.duration;
            this.sourceBones=model.inspection.bones.map(b=>b.path);
            this.instance = model.instantiate(); this.motion = new ModelMotion(this.instance);
            this.instance.root.scale.setScalar(entry.data.unitScale); this.instance.root.rotation.set(...entry.data.orientation);
            this.instance.setAppearance('white'); this.skeleton = new T.SkeletonHelper(this.instance.root);
            (this.skeleton.material as T.Material).depthTest = false;
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); this.renderer.setClearColor('#151515');
            host.replaceChildren(this.renderer.domElement);
            this.controls = new OrbitControls(this.camera, this.renderer.domElement); this.controls.enableDamping = true;
            this.controls.addEventListener('change',()=>{this.dirty=true;});
            this.scene.add(this.grid, this.marker, new T.HemisphereLight('#ffffff', '#777777', 2.5));
            this.marker.visible=false;this.marker.renderOrder=10;
            const sun = new T.DirectionalLight('#ffffff', 3); sun.position.set(3, 5, 4); this.scene.add(sun);
            if(view==='human') {
                if(!rigStatus(entry.data.rig).complete)throw Error('请先补齐骨架映射');
                this.target.clips=[{id:'preview',action:'retarget',start:0,end:entry.duration,speed:1,retarget:clone(entry.data)}];
                // Library preview has no director route. Inspect the source clock, leaving saved cadence settings intact.
                delete this.target.clips[0].retarget!.locomotion;
                this.human=makeHuman(this.target);
                const skeleton=builtinHumanoidSkeleton(this.human,this.target);this.targetBones=skeleton.bones;
                this.runtime=new RetargetRuntime(()=>model);this.runtime.register(this.target.id,this.target,skeleton);
                this.scene.add(this.human.root);
            } else this.scene.add(this.motion.root,this.skeleton);
            this.sample(0);this.hipOrigin.copy(this.hipPosition());this.frameAll();
            this.frame = requestAnimationFrame(time => this.tick(time));
        } catch(error) {this.dispose();throw error;}
    }
    get time(){return this.elapsed;}
    seek(time:number){if(!Number.isFinite(time))return;this.elapsed=Math.max(0,Math.min(this.entry.duration,time));this.playing=false;this.sample(this.elapsed);this.notified=-Infinity;}
    selectBone(path:string){this.bonePath=path;this.sample(this.elapsed);}
    frameAll(){
        const points=this.view==='human'?Object.values(this.targetBones!).map(b=>b!.getWorldPosition(new T.Vector3()))
            :this.sourceBones.map(path=>this.instance.nodePosition(path));
        const bounds=this.human?new T.Box3().setFromObject(this.human.root):points.length?new T.Box3().setFromPoints(points):new T.Box3().setFromObject(this.motion.root);
        const size=Math.max(.3,bounds.getSize(new T.Vector3()).length());
        bounds.getCenter(this.controls.target);this.camera.position.copy(this.controls.target).add(new T.Vector3(size,size*.3,size*1.5));this.controls.update();
    }
    private hipPosition(){return this.view==='human'?this.targetBones!.hips!.getWorldPosition(new T.Vector3()):this.entry.data.rig.bones.hips?this.instance.nodePosition(this.entry.data.rig.bones.hips):new T.Vector3();}
    private sample(time:number){
        this.dirty=true;
        const at=Math.min(time,Math.max(0,this.entry.duration-1e-8));
        this.motion.sample(this.entry.data.index,at,this.entry.data.loop,this.entry.data.motion);
        if(this.runtime){
            this.runtime.sample(this.target.id,this.target,at);
            this.runtime.ground(this.target.id,this.target,at,(point,reach)=>Math.abs(point.y)<=reach?0:null,(entity,time)=>{this.runtime!.sample(this.target.id,entity,time);});
        }
        this.scene.updateMatrixWorld(true);
        const part=Object.entries(this.entry.data.rig.bones).find(([,path])=>path===this.bonePath)?.[0] as HumanBone | undefined;
        const target=part&&this.targetBones?.[part];
        this.marker.visible=!!this.bonePath&&(this.view==='source'||!!target);
        if(this.marker.visible)this.marker.position.copy(target?target.getWorldPosition(new T.Vector3()):this.instance.nodePosition(this.bonePath));
    }
    state():MotionPreviewState {
        const foot=(side:'leftFoot'|'rightFoot')=>this.view==='human'?this.targetBones![side]?.getWorldPosition(new T.Vector3()).y??null
            :this.entry.data.rig.bones[side]?this.instance.nodePosition(this.entry.data.rig.bones[side]!).y:null;
        return {time:this.elapsed,sourceTime:nativeSourceTime(this.elapsed,this.sourceDuration,this.entry.data.loop),view:this.view,
            leftFoot:foot('leftFoot'),rightFoot:foot('rightFoot'),displacement:this.hipPosition().sub(this.hipOrigin).toArray()};
    }
    private tick(time: number) {
        if (this.maxFps < 60 && this.previous && time-this.previous < 1000/this.maxFps) { this.frame=requestAnimationFrame(t=>this.tick(t)); return; }
        const before=this.elapsed;
        if (this.previous && this.playing) this.elapsed = (this.elapsed+Math.min(.1, (time - this.previous) / 1000))%this.entry.duration;
        this.previous = time;
        const width = Math.max(1, this.host.clientWidth), height = Math.max(1, this.host.clientHeight);
        if (width !== this.width || height !== this.height) {
            this.width = width; this.height = height;
            this.renderer.setSize(width, height, false); this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
            this.dirty=true;
        }
        if(this.elapsed!==before)this.sample(this.elapsed);
        this.controls.update();
        if(this.dirty){this.renderer.render(this.scene,this.camera);this.dirty=false;}
        if(time-this.notified>=100){this.notified=time;this.onFrame?.(this.state());}
        this.frame = requestAnimationFrame(t => this.tick(t));
    }
    dispose() {
        cancelAnimationFrame(this.frame); this.controls?.dispose();this.runtime?.clear();this.instance?.dispose();
        if(this.human)disposeTree(this.human.root);this.skeleton?.dispose();
        this.grid.geometry.dispose(); (this.grid.material as T.Material).dispose();this.marker.geometry.dispose();this.marker.material.dispose();
        this.renderer.dispose(); this.renderer.forceContextLoss(); this.host.replaceChildren();
    }
}
