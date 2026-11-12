import {Matrix4,Vector3} from 'three';
import type {Entity,Vec3} from '../model.ts';
import type {NumberKey} from '../animation/channels.ts';

export interface FlowCameraFrame {time:number;position:Vec3;target:Vec3;up:Vec3;focal:number;frameX:number;frameY:number}
export interface FlowCamera {fps:30;frames:FlowCameraFrame[];source:string}
export function applyFlowCamera(entity:Entity,input:FlowCamera,duration:number){
    const vector=(v:unknown):v is Vec3=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
    if(!input||input.fps!==30||!Array.isArray(input.frames)||!input.frames.length||input.frames.length>5000)throw Error('相机识别结果无效');
    const focal:NumberKey[]=[],roll:NumberKey[]=[],frameX:NumberKey[]=[],frameY:NumberKey[]=[];
    let previousRoll=0;
    for(const [i,f] of input.frames.entries()){
        if(!Number.isFinite(f.time)||f.time<0||f.time>duration||i>0&&f.time<=input.frames[i-1].time||![f.position,f.target,f.up].every(vector)
            ||![f.focal,f.frameX,f.frameY].every(Number.isFinite)||f.focal<8||f.focal>300||Math.abs(f.frameX)>.9||Math.abs(f.frameY)>.9)throw Error('相机识别参数或时间无效');
        const position=new Vector3(...f.position),target=new Vector3(...f.target),up=new Vector3(...f.up).normalize();
        if(position.distanceToSquared(target)<1e-10||up.lengthSq()<.5||new Vector3().subVectors(target,position).normalize().cross(up).lengthSq()<1e-8)throw Error('相机识别方向无效');
        const base=new Matrix4().lookAt(position,target,new Vector3(0,1,0));
        let angle=Math.atan2(-up.dot(new Vector3().setFromMatrixColumn(base,0)),up.dot(new Vector3().setFromMatrixColumn(base,1)))*180/Math.PI;
        if(i){while(angle-previousRoll>180)angle-=360;while(angle-previousRoll< -180)angle+=360;}
        previousRoll=angle;
        focal.push({time:f.time,value:f.focal});roll.push({time:f.time,value:angle});frameX.push({time:f.time,value:f.frameX});frameY.push({time:f.time,value:f.frameY});
    }
    entity.name='识别镜头';entity.position=[...input.frames[0].position];
    entity.path={smooth:false,points:input.frames.map(f=>({time:f.time,position:[...f.position]}))};
    const camera=entity.camera!;
    camera.mode='free';camera.aim='target';camera.targetId='';camera.target=[...input.frames[0].target];camera.focal=input.frames[0].focal;
    camera.targetPath={smooth:false,points:input.frames.map(f=>({time:f.time,position:[...f.target]}))};
    camera.effects={channels:{focal:{keys:focal},roll:{keys:roll},frameX:{keys:frameX},frameY:{keys:frameY}}};
}
