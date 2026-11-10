import {Object3D,PerspectiveCamera,Quaternion,Vector3} from 'three';
import type {Entity,Project} from '../model.ts';
import type {Rig} from '../assets/human-legacy.ts';
import {aspectNumber} from '../model.ts';
import {entityPosition,entityYaw} from '../timeline.ts';
import {cameraLookAt} from '../animation/camera-look.ts';
import {cameraAimResponseQuaternion} from './aim-response.ts';
import {applyCameraEffects,cameraFocal} from './camera-effects.ts';

export interface CameraSampleContext {
    models: ReadonlyMap<string,Object3D>;
    rigs: ReadonlyMap<string,Pick<Rig,'head'|'headRestHeight'>>;
    rootAt?: (id:string,time:number)=>Pick<Object3D,'position'|'rotation'>|undefined;
}

export function configureCamera(camera:PerspectiveCamera,focal:number,aspect:number){
    camera.aspect=aspect;camera.filmGauge=36;camera.setFocalLength(focal);
    camera.near=.025;camera.far=2000;camera.updateProjectionMatrix();
}

export function cameraTargetPosition(e:Entity,project:Project,time:number,models:ReadonlyMap<string,Object3D>){
    const c=e.camera!;
    if(c.targetPath)return cameraLookAt(c.targetPath,time);
    const target=project.entities.find(x=>x.id===c.targetId);
    return target?(models.get(target.id)?.position.clone()??entityPosition(target,time)).add(new Vector3(0,c.targetHeight,0)):new Vector3(...c.target);
}

/** Shared deterministic camera evaluation for browser, native preview and output. */
export function sampleCamera(camera:PerspectiveCamera,e:Entity,project:Project,time:number,context:CameraSampleContext){
    const c=e.camera!,{models,rigs,rootAt}=context;
    camera.position.copy(entityPosition(e,time));
    const target=c.targetId?project.entities.find(x=>x.id===c.targetId):null;
    const look=()=>cameraTargetPosition(e,project,time,models);
    if((c.mode==='follow'||c.mode==='pov')&&target){
        // Renderers can temporarily lack an imported target while its geometry is loading.
        const targetRoot=models.get(target.id)??new Object3D();
        if(!models.has(target.id)){
            targetRoot.position.copy(entityPosition(target,time));
            targetRoot.rotation.set(target.rotation[0],entityYaw(target,time,project),target.rotation[2]);
            targetRoot.scale.fromArray(target.scale);
        }
        const offset=new Vector3(...c.offset);
        if(c.mode==='pov'){
            const rig=rigs.get(target.id);
            if(rig&&c.inheritRotation){
                offset.y-=rig.headRestHeight??1.53;
                camera.position.copy(rig.head.localToWorld(offset));
                const q=rig.head.getWorldQuaternion(new Quaternion());
                camera.lookAt(camera.position.clone().add(new Vector3(0,0,1).applyQuaternion(q)));
            }else{
                camera.position.copy(targetRoot.localToWorld(offset));
                const q=targetRoot.getWorldQuaternion(new Quaternion());
                camera.lookAt(camera.position.clone().add(new Vector3(0,0,1).applyQuaternion(q)));
            }
        }else{
            const lagTime=Math.max(0,time-(c.effects?.followLag??0));
            const physical=rootAt?.(target.id,lagTime);
            if(c.inheritRotation)offset.applyAxisAngle(new Vector3(0,1,0),physical?.rotation.y??(c.effects?.followLag?entityYaw(target,lagTime,project):targetRoot.rotation.y));
            camera.position.copy(physical?.position??(c.effects?.followLag&&!target.handBinding?entityPosition(target,lagTime):targetRoot.position)).add(offset);
            camera.lookAt(look());
        }
    }else if(c.aim==='manual')camera.rotation.set(...e.rotation);
    else camera.lookAt(look());
    const response=cameraAimResponseQuaternion(e,project,time,target?models.get(target.id):undefined,target&&rootAt?at=>rootAt(target.id,at):undefined);
    if(response)camera.quaternion.copy(response);
    configureCamera(camera,cameraFocal(c.effects,time,c.focal,camera.position.distanceTo(look())),aspectNumber(project.aspect));
    applyCameraEffects(camera,c.effects,time);
    camera.updateMatrixWorld(true);
    return camera;
}
