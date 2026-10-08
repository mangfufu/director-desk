import * as T from 'three';
import * as C from 'cannon-es';
import type { Rig } from '../assets/human-legacy.ts';
import type { PhysicsBody } from './model.ts';
import { cq,cv } from './colliders.ts';

export type PhysicsBones = Partial<Record<string,T.Object3D>>;
export interface BoneBody { body:C.Body; bone:T.Object3D; origin:C.Vec3; orientation:T.Quaternion }
export function rigPhysicsBones(r:Rig):PhysicsBones {
    const b:PhysicsBones={hips:r.hips,spine:r.joints.torso,head:r.head};
    for(const side of ['left','right'])for(const [name,joint]of [['UpperArm','Arm'],['LowerArm','Elbow'],['UpperLeg','Hip'],['LowerLeg','Knee'],['Foot','Ankle']])b[side+name]=r.joints[side+joint];
    return b;
}
/** Articulated coarse collision bodies, fitted once to the currently evaluated skeleton. */
export function makeRagdoll(world:C.World,bones:PhysicsBones,config:PhysicsBody,material:C.Material):BoneBody[] {
    const segments:[string,string|undefined,string|undefined,number][]=[['hips','spine',undefined,.17],['spine','head','hips',.2],['head',undefined,'spine',.09]];
    for(const side of ['left','right'])segments.push([side+'UpperArm',side+'LowerArm','spine',.04],[side+'LowerArm',side+'Hand',side+'UpperArm',.025],
        [side+'UpperLeg',side+'LowerLeg','hips',.085],[side+'LowerLeg',side+'Foot',side+'UpperLeg',.055],[side+'Foot',side+'Toes',side+'LowerLeg',.02]);
    const entries:BoneBody[]=[],byName=new Map<string,BoneBody>();
    const weightTotal=segments.reduce((sum,[name,,,weight])=>sum+(bones[name]?weight:0),0);
    const stature=bones.head!.getWorldPosition(new T.Vector3()).distanceTo(bones.hips!.getWorldPosition(new T.Vector3()))/ .65;
    for(const [name,tip,,weight]of segments){
        const bone=bones[name];if(!bone)continue;
        const start=bone.getWorldPosition(new T.Vector3());
        const fallback = name === 'head' ? new T.Vector3(0,.2*stature,0) : name.endsWith('Foot') ? new T.Vector3(0,0,.14*stature) : new T.Vector3(0,-.22*stature,0);
        const finish=bones[tip??'']?.getWorldPosition(new T.Vector3())??start.clone().add(fallback.applyQuaternion(bone.getWorldQuaternion(new T.Quaternion())));
        const direction=finish.clone().sub(start),length=Math.max(.04,direction.length()),q=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),direction.normalize());
        const radius=(name==='hips'||name==='spine'?.12:name==='head'?.115:name.includes('UpperLeg')?.075:.045)*stature;
        const body=new C.Body({mass:config.mass*weight/weightTotal,material,linearDamping:config.damping,angularDamping:Math.max(.15,config.damping),allowSleep:true});
        if(name==='head')body.addShape(new C.Sphere(Math.max(.025,radius)));
        else body.addShape(new C.Box(new C.Vec3(Math.max(.02,radius),length/2,Math.max(.02,radius))));
        body.position.copy(cv(start.clone().lerp(finish,.5)));body.quaternion.copy(cq(q));world.addBody(body);
        const entry={body,bone,origin:body.pointToLocalFrame(cv(start)),orientation:q.clone().invert().multiply(bone.getWorldQuaternion(new T.Quaternion()))};entries.push(entry);byName.set(name,entry);
    }
    for(const [name,,parent]of segments){
        const a=byName.get(parent??''),b=byName.get(name);if(!a||!b)continue;
        const joint=cv(b.bone.getWorldPosition(new T.Vector3())),hinge=name.includes('Lower');
        const axisWorld=hinge ? cv(new T.Vector3(1,0,0).applyQuaternion(b.bone.getWorldQuaternion(new T.Quaternion()))) : b.body.vectorToWorldFrame(new C.Vec3(0,1,0));
        const angle=hinge?.06:name==='spine'?.35:name==='head'?.55:name.endsWith('Foot')?.3:1.05;
        const twist=hinge?1.35:name==='spine'?.35:name==='head'?.4:name.endsWith('Foot')?.15:.5;
        world.addConstraint(new C.ConeTwistConstraint(a.body,b.body,{pivotA:a.body.pointToLocalFrame(joint),pivotB:b.body.pointToLocalFrame(joint),
            axisA:a.body.vectorToLocalFrame(axisWorld),axisB:b.body.vectorToLocalFrame(axisWorld),angle,twistAngle:twist,collideConnected:false,maxForce:config.mass*5000}));
    }
    return entries;
}
