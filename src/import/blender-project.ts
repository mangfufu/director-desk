import {Color, Euler, Matrix4, Vector3} from 'three';
import {ASPECTS, FRAME_RATES, assertProject, entity, uid, type Project, type Vec3} from '../model.ts';
import {defaultLight,defaultLighting} from '../lighting/model.ts';
import type {ModelPackage} from '../resources/model-package.ts';
import type {ModelResource} from '../resources/project-resources.ts';
import type {ModelInspection} from '../resources/model-runtime.ts';
import type {AnimatedNumber} from '../animation/channels.ts';

export interface BlenderCameraSample {time:number;position:Vec3;forward:Vec3;up:Vec3;verticalSpan:number;frameX:number;frameY:number}
export interface BlenderScene {
    version:1;name:string;fps:number;duration:number;aspect:number;unitScale:number;warnings:string[];
    models:{name:string;skinned:boolean;package:ModelPackage}[];
    cameras:{id:string;name:string;samples:BlenderCameraSample[]}[];
    lights:{name:string;type:string;position:Vec3;forward:Vec3;up:Vec3;color:Vec3;energy:number;temperature?:number;angle:number;penumbra:number;width:number;height:number}[];
    cuts:{time:number;camera:string}[];
}
const ratio=(s:string)=>{const [w,h]=s.split(':').map(Number);return w/h;};
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
const vector=(v:Vec3)=>new Vector3(...v);
const channel=(samples:BlenderCameraSample[],get:(s:BlenderCameraSample)=>number):AnimatedNumber=>{
    const keys=samples.map(s=>({time:s.time,value:get(s)}));
    return keys.every(k=>Math.abs(k.value-keys[0].value)<1e-7)?keys[0].value:{keys};
};

/** Models retain their exported world coordinates; compensate the editor's bottom-centre normalization. */
export function buildBlenderProject(scene:BlenderScene,models:{resource:ModelResource;inspection:ModelInspection}[]) {
    if(scene.version!==1||!Number.isFinite(scene.duration)||scene.duration<=0||!Number.isFinite(scene.aspect)||scene.aspect<=0||!Number.isFinite(scene.fps)||scene.fps<=0||!Number.isFinite(scene.unitScale)||scene.unitScale<=0)throw Error('Blender 场景参数无效');
    const warnings=[...scene.warnings];
    const aspect=ASPECTS.reduce((a,b)=>Math.abs(ratio(a)-scene.aspect)<Math.abs(ratio(b)-scene.aspect)?a:b);
    const fps=FRAME_RATES.reduce((a,b)=>Math.abs(a-scene.fps)<Math.abs(b-scene.fps)?a:b);
    if(Math.abs(ratio(aspect)-scene.aspect)>.001)warnings.push(`画幅已调整为 ${aspect}。`);
    if(fps!==scene.fps)warnings.push(`帧率已调整为 ${fps} fps；动画仍按原秒数播放。`);
    const project:Project={format:'director-desk',version:2,name:scene.name.slice(0,200),duration:scene.duration,fps,aspect,room:{enabled:false,width:20,depth:20,height:10},entities:[],cuts:[],references:[],resources:[]};
    for(const {resource,inspection} of models) {
        if(!inspection.meshes)continue;
        if(!project.resources!.some(r=>r.id===resource.id))project.resources!.push(resource);
        const {min,max}=inspection.bounds,unit=scene.unitScale;
        const humanoid=inspection.skins>0&&inspection.rigSuggestion.complete;
        const e=entity(humanoid?'actor':'prop','external-model',resource.name.slice(0,200),[(min[0]+max[0])/2*unit,min[1]*unit,(min[2]+max[2])/2*unit]);
        e.face='fixed';e.external={resourceId:resource.id,appearance:'original',unitScale:unit,orientation:[0,0,0]};
        // External geometry keeps its source scale. Height is only the editor's
        // humanoid parameter, not a reason to reject a rigged blind or machine.
        if(humanoid){e.height=clamp((max[1]-min[1])*unit,.2,10);e.external.rig=structuredClone(inspection.rigSuggestion.rig);}
        const animation=inspection.animations.find(a=>a.duration>0&&a.tracks>0);
        if(animation)e.clips=[{id:uid(),name:animation.name,action:'native',native:{index:animation.index,loop:false},start:0,end:scene.duration,speed:1}];
        if(inspection.animations.length>1)warnings.push(resource.name+'：已放入第一段动画，其余动画保留在模型资源中。');
        project.entities.push(e);
    }
    const cameraIds=new Map<string,string>();
    for(const source of scene.cameras) {
        if(!source.samples.length)continue;
        const samples=source.samples,first=samples[0],e=entity('camera','camera',source.name.slice(0,200),first.position);
        cameraIds.set(source.id,e.id);e.camera!.mode='free';e.camera!.aim='target';
        const aim=(s:BlenderCameraSample)=>vector(s.position).add(vector(s.forward).normalize().multiplyScalar(10)).toArray() as Vec3;
        e.camera!.target=aim(first);
        if(samples.length>1){
            e.path={smooth:false,points:samples.map(s=>({time:s.time,position:s.position}))};
            e.camera!.targetPath={smooth:false,points:samples.map(s=>({time:s.time,position:aim(s)}))};
        }
        const focal=(s:BlenderCameraSample)=>clamp(36/Math.max(ratio(aspect),1)/s.verticalSpan,8,300);
        if(samples.some(s=>36/Math.max(ratio(aspect),1)/s.verticalSpan<8||36/Math.max(ratio(aspect),1)/s.verticalSpan>300))warnings.push(source.name+'：焦距已调整到 8–300 mm 范围。');
        const roll=(s:BlenderCameraSample)=>{
            const basis=new Matrix4().lookAt(vector(s.position),vector(aim(s)),new Vector3(0,1,0));
            const right=new Vector3().setFromMatrixColumn(basis,0),up=new Vector3().setFromMatrixColumn(basis,1),actual=vector(s.up);
            return Math.atan2(-actual.dot(right),actual.dot(up))*180/Math.PI;
        };
        // Reconstruct roll around the camera's local -Z direction, unwrapped across +/-180 degrees.
        let last=0;
        const rolls=new Map<BlenderCameraSample,number>();
        for(const s of samples){let value=roll(s);while(value-last>180)value-=360;while(value-last< -180)value+=360;rolls.set(s,clamp(value,-1080,1080));last=value;}
        e.camera!.focal=focal(first);
        e.camera!.effects={channels:{focal:channel(samples,focal),roll:channel(samples,s=>rolls.get(s)!),frameX:channel(samples,s=>clamp(s.frameX,-.9,.9)),frameY:channel(samples,s=>clamp(s.frameY,-.9,.9))}};
        project.entities.push(e);
    }
    for(const source of scene.lights) {
        const asset=({POINT:'light-point',SPOT:'light-spot',AREA:'light-area',SUN:'light-sun'} as Record<string,string>)[source.type];if(!asset)continue;
        const e=entity('prop',asset,source.name.slice(0,200),source.position);
        e.color='#'+new Color().setRGB(...source.color).getHexString();
        e.rotation=new Euler().setFromRotationMatrix(new Matrix4().lookAt(new Vector3(),vector(source.forward),vector(source.up))).toArray().slice(0,3) as Vec3;
        e.light={...defaultLight(asset),intensity:clamp(source.type==='POINT'||source.type==='SPOT'?source.energy/(4*Math.PI):source.type==='AREA'?source.energy/Math.max(.001,source.width*source.height*Math.PI):source.energy,0,100000),range:10000,angle:clamp(source.angle*90/Math.PI,1,89),penumbra:clamp(source.penumbra,0,1),width:clamp(source.width,.01,500),height:clamp(source.height,.01,500)};
        if(source.temperature!==undefined)e.light.temperature=clamp(source.temperature,1000,15000);
        if(source.type==='SUN'&&models.length){
            const radius=Math.max(...models.flatMap(({inspection:{bounds}})=>[bounds.min,bounds.max].map(p=>vector(p).multiplyScalar(scene.unitScale).distanceTo(vector(source.position)))));
            e.light.range=clamp(radius*2,1,10000);
        }
        project.entities.push(e);
    }
    project.cuts=scene.cuts.filter(c=>cameraIds.has(c.camera)).map(c=>({time:c.time,cameraId:cameraIds.get(c.camera)!}));
    if(scene.lights.length)project.lighting={...defaultLighting(),defaultLights:false,ambient:.3,exposure:1};
    assertProject(project);return {project,warnings:[...new Set(warnings)]};
}
