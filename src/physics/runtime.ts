import * as T from 'three';
import * as C from 'cannon-es';
import type { Entity,Project } from '../model.ts';
import { canUsePhysics,defaultPhysicsBody,type PhysicsBody } from './model.ts';
import { addCollider,cv,cq } from './colliders.ts';
import { RigidBody } from './rigid-body.ts';
import { makeRagdoll,type BoneBody,type PhysicsBones } from './ragdoll.ts';

const STEP=1/120, CACHE_BYTES=32*1024*1024;
interface Participant { entity:Entity; config?:PhysicsBody; root:T.Object3D; bodies:C.Body[]; bones:BoneBody[]; rootOffset?:C.Vec3; rootOrientation?:T.Quaternion; release:boolean; impulse:number }
/** Fixed-step simulation, with bounded frame storage. The saved project contains only inputs. */
export class PhysicsRuntime {
    private key='';private world?:C.World;private participants:Participant[]=[];private tracked:C.Body[]=[];
    private frames=new Map<number,Float64Array>();private step=0;private maxFrames=1;
    private restored=new Map<T.Object3D,{position:T.Vector3;quaternion:T.Quaternion;scale:T.Vector3}>();
    private models:Map<string,T.Group>;private bones:(e:Entity)=>PhysicsBones|undefined;private room:()=>T.Object3D;
    constructor(models:Map<string,T.Group>,bones:(e:Entity)=>PhysicsBones|undefined,room:()=>T.Object3D){this.models=models;this.bones=bones;this.room=room;}
    restore(){for(const [node,pose]of this.restored){node.position.copy(pose.position);node.quaternion.copy(pose.quaternion);node.scale.copy(pose.scale);node.updateMatrix();}this.restored.clear();}
    invalidate(){this.restore();this.key='';this.world=undefined;this.frames.clear();this.participants=[];this.tracked=[];}
    dispose(){this.invalidate();}
    private signature(p:Project){return JSON.stringify([p.physics,p.room,p.entities.map(e=>[e.id,e.asset,e.kind,e.visible,e.height,e.build,e.scale,e.position,e.rotation,e.path,e.face,e.faceTarget,
        e.physics,e.external,e.clips,e.pose,e.poseKeys,e.initialPose,e.parameters,e.assetParameters,e.handBinding,e.structureLink,e.deform,e.field,e.visual,e.warp]),p.resources?.map(r=>r.id)]);}
    private init(p:Project,baseline:(time:number)=>void){
        this.frames.clear();this.participants=[];this.tracked=[];this.step=0;baseline(0);
        const world=this.world=new C.World({gravity:cv(new T.Vector3(...p.physics!.gravity)),allowSleep:true});
        world.broadphase=new C.SAPBroadphase(world); (world.solver as C.GSSolver).iterations=12;
        world.defaultContactMaterial.friction=.5;world.defaultContactMaterial.restitution=.1;
        // Both sides need materials: Cannon otherwise ignores a body's friction/restitution overrides.
        const groundMaterial=new C.Material({friction:.5,restitution:1});
        if(p.physics!.ground){const ground=new C.Body({mass:0,material:groundMaterial});ground.addShape(new C.Plane());ground.quaternion.setFromEuler(-Math.PI/2,0,0);world.addBody(ground);}
        if(p.room.enabled){const body=new C.Body({mass:0,material:groundMaterial});if(addCollider(body,this.room(),'auto',true,false))world.addBody(body);}
        for(const e of p.entities){
            if(!e.visible||!canUsePhysics(e))continue;
            // Unconfigured scenery participates as a static obstacle; an explicit disabled body opts out.
            const config=e.physics??(e.kind==='prop'&&(e.path||e.clips.length)?{...defaultPhysicsBody(),mode:'kinematic' as const}:undefined),root=this.models.get(e.id);if(!root||config&&!config.enabled||!config&&e.kind!=='prop')continue;
            const material=new C.Material({friction:config?.friction??.5,restitution:config?.restitution??1});
            let bodies:C.Body[]=[],bones:BoneBody[]=[],rootOffset:C.Vec3|undefined,rootOrientation:T.Quaternion|undefined;
            if(config?.ragdoll){
                baseline(config.start);root.updateWorldMatrix(true,true);const skeleton=this.bones(e);if(!skeleton?.hips||!skeleton.head)throw Error(`「${e.name}」缺少布娃娃人形骨架`);
                bones=makeRagdoll(world,skeleton,config,material);bodies=bones.map(b=>b.body);
                rootOffset=bodies[0].pointToLocalFrame(cv(root.getWorldPosition(new T.Vector3())));
                rootOrientation=new T.Quaternion(bodies[0].quaternion.x,bodies[0].quaternion.y,bodies[0].quaternion.z,bodies[0].quaternion.w).invert().multiply(root.getWorldQuaternion(new T.Quaternion()));baseline(0);
            }else{
                const body=new RigidBody({mass:config?.mode==='dynamic'?config.mass:0,material,linearDamping:config?.damping??.05,angularDamping:config?.damping??.05,allowSleep:true});
                const centered=!!config&&config.mode!=='static';
                if(!addCollider(body,root,config?.shape??'auto',!config||config.mode==='static',true,centered))continue;
                if(centered){rootOffset=body.pointToLocalFrame(cv(root.getWorldPosition(new T.Vector3())));rootOrientation=new T.Quaternion();}
                world.addBody(body);bodies=[body];
            }
            bodies.forEach(body=>{body.type=config?.mode==='static'||!config?C.Body.STATIC:C.Body.KINEMATIC;body.collisionFilterMask=config?.collisions===false?0:-1;body.updateMassProperties();});
            this.participants.push({entity:e,config,root,bodies,bones,rootOffset,rootOrientation,release:false,impulse:0});
            if(config?.mode==='dynamic')this.tracked.push(...bodies);
        }
        baseline(0);this.update(0,baseline);this.world.bodies.forEach(b=>b.force.set(0,0,0));this.save();this.maxFrames=Math.max(2,Math.floor(CACHE_BYTES/Math.max(8,this.tracked.length*56)));
    }
    private poseBody(part:Participant,index:number){
        const bone=part.bones[index],body=part.bodies[index];
        if(bone){const rotation=bone.bone.getWorldQuaternion(new T.Quaternion()).multiply(bone.orientation.clone().invert());body.quaternion.copy(cq(rotation));
            body.position.copy(cv(bone.bone.getWorldPosition(new T.Vector3()).sub(new T.Vector3(bone.origin.x,bone.origin.y,bone.origin.z).applyQuaternion(rotation))));}
        else{
            const rotation=part.root.getWorldQuaternion(new T.Quaternion()).multiply(part.rootOrientation?.clone().invert()??new T.Quaternion());
            const position=part.root.getWorldPosition(new T.Vector3());
            if(part.rootOffset)position.sub(new T.Vector3(part.rootOffset.x,part.rootOffset.y,part.rootOffset.z).applyQuaternion(rotation));
            body.position.copy(cv(position));body.quaternion.copy(cq(rotation));
        }
        body.aabbNeedsUpdate=true;
    }
    private update(time:number,baseline:(time:number)=>void){
        baseline(time);
        for(const part of this.participants){const config=part.config;
            if(!config)continue;
            if(config.mode!=='dynamic'||time+1e-9<config.start){
                if(config.mode!=='static')part.bodies.forEach((body,index)=>{
                    const pos=body.position.clone(),q=body.quaternion.clone();this.poseBody(part,index);
                    body.velocity.copy(body.position.vsub(pos).scale(1/STEP));
                    // Kinematic motion is already evaluated at the boundary, never integrate it a second time.
                    body.previousPosition.copy(body.position);body.interpolatedPosition.copy(body.position);body.angularVelocity.set(0,0,0);body.quaternion.normalize();
                    if(time===0){body.velocity.set(0,0,0);body.quaternion.copy(q);this.poseBody(part,index);}
                });continue;
            }
            if(!part.release){
                const inherited=new T.Vector3();
                if(config.inertia && time>0){const before=part.root.getWorldPosition(new T.Vector3());baseline(Math.max(0,time-STEP));inherited.copy(before).sub(part.root.getWorldPosition(new T.Vector3())).multiplyScalar(1/STEP);baseline(time);}
                part.bodies.forEach((body,index)=>{this.poseBody(part,index);body.type=C.Body.DYNAMIC;body.updateMassProperties();body.wakeUp();body.velocity.copy(cv(new T.Vector3(...config.velocity).add(inherited)));body.angularVelocity.set(...config.angularVelocity);});part.release=true;
            }
            for(const body of part.bodies){
                if(!config.gravity){body.force.vsub(this.world!.gravity.scale(body.mass),body.force);}
                if(!config.inertia){body.velocity.x=0;body.velocity.z=0;body.angularVelocity.set(0,0,0);if(!config.gravity)body.velocity.y=0;}
            }
            while(part.impulse<config.impulses.length && config.impulses[part.impulse].time<=time+1e-9){
                const event=config.impulses[part.impulse++],total=part.bodies.reduce((sum,b)=>sum+b.mass,0);
                // A whole-object impulse is distributed by mass, so ragdolls don't multiply its strength.
                for(const body of part.bodies)body.applyImpulse(new C.Vec3(...event.impulse).scale(body.mass/total),new C.Vec3(...event.point));
            }
        }
    }
    private save(){const frame=new Float64Array(this.tracked.length*7);this.tracked.forEach((b,i)=>frame.set([b.position.x,b.position.y,b.position.z,b.quaternion.x,b.quaternion.y,b.quaternion.z,b.quaternion.w],i*7));this.frames.set(this.step,frame);
        while(this.frames.size>this.maxFrames){const oldest=this.frames.keys().next().value!;this.frames.delete(oldest);}}
    private applyNode(node:T.Object3D,position:T.Vector3,rotation:T.Quaternion,preservePosition=false){
        this.restored.set(node,{position:node.position.clone(),quaternion:node.quaternion.clone(),scale:node.scale.clone()});node.parent?.updateWorldMatrix(true,false);
        if(node.parent){position.applyMatrix4(node.parent.matrixWorld.clone().invert());rotation.premultiply(node.parent.getWorldQuaternion(new T.Quaternion()).invert());}
        if(!preservePosition)node.position.copy(position);node.quaternion.copy(rotation);node.updateMatrix();node.updateWorldMatrix(false,true);
    }
    sample(p:Project,time:number,baseline:(time:number)=>void){
        if(!p.physics?.enabled||!p.entities.some(e=>e.physics?.enabled)){if(this.key)this.invalidate();return;}
        const dynamic=p.entities.some(e=>e.physics?.enabled&&e.physics.mode==='dynamic');
        const key=this.signature(p),lower=dynamic?Math.floor(Math.max(0,time)/STEP+1e-8):0,upper=dynamic?lower+1:0;
        if(key!==this.key||lower<this.step&&!this.frames.has(lower)){this.restore();this.init(p,baseline);this.key=key;}
        while(this.step<upper){this.update(this.step*STEP,baseline);
            // Cannon integrates kinematic bodies. Temporarily freeze them after supplying contact velocity.
            const kinematic=this.participants.flatMap(part=>part.bodies.filter(b=>b.type===C.Body.KINEMATIC).map(body=>({body,p:body.position.clone(),q:body.quaternion.clone()})));
            this.world!.step(STEP);for(const {body,p:qpos,q}of kinematic){body.position.copy(qpos);body.quaternion.copy(q);body.aabbNeedsUpdate=true;}
            this.step++;this.save();
        }
        baseline(time);const a=this.frames.get(lower)!,b=this.frames.get(upper)??a,u=Math.min(1,Math.max(0,time/STEP-lower));
        const offsets=new Map(this.tracked.map((body,index)=>[body,index*7]));
        const transform=(body:C.Body)=>{const offset=offsets.get(body);return {
            position:offset===undefined?new T.Vector3(body.position.x,body.position.y,body.position.z):new T.Vector3(a[offset],a[offset+1],a[offset+2]).lerp(new T.Vector3(b[offset],b[offset+1],b[offset+2]),u),
            rotation:offset===undefined?new T.Quaternion(body.quaternion.x,body.quaternion.y,body.quaternion.z,body.quaternion.w):new T.Quaternion(a[offset+3],a[offset+4],a[offset+5],a[offset+6]).slerp(new T.Quaternion(b[offset+3],b[offset+4],b[offset+5],b[offset+6]),u)};};
        for(const part of this.participants){if(!part.config||part.config.mode==='kinematic'||part.config.mode==='dynamic'&&time<part.config.start)continue;
            if(part.rootOffset&&part.rootOrientation){const {position,rotation}=transform(part.bodies[0]);position.add(new T.Vector3(part.rootOffset.x,part.rootOffset.y,part.rootOffset.z).applyQuaternion(rotation));this.applyNode(part.root,position,rotation.multiply(part.rootOrientation));}
            part.bodies.forEach((body,index)=>{const {position,rotation}=transform(body);
                const bone=part.bones[index],node=bone?.bone??part.root;
                if(!bone&&part.rootOffset)return;
                if(bone){position.add(new T.Vector3(bone.origin.x,bone.origin.y,bone.origin.z).applyQuaternion(rotation));rotation.multiply(bone.orientation);}
                this.applyNode(node,position,rotation,!!bone&&index>0);
            });
        }
    }
    state(id:string){const part=this.participants.find(p=>p.entity.id===id);return part?{bodies:part.bodies.length,ragdoll:!!part.bones.length,cachedFrames:this.frames.size}:null;}
    rootAt(id:string,time:number){
        const part=this.participants.find(p=>p.entity.id===id);if(!part?.config||part.config.mode!=='dynamic'||time<part.config.start)return undefined;
        const lower=Math.floor(Math.max(0,time)/STEP+1e-8),a=this.frames.get(lower),b=this.frames.get(lower+1)??a;if(!a||!b)return undefined;
        const offset=this.tracked.indexOf(part.bodies[0])*7,u=T.MathUtils.clamp(time/STEP-lower,0,1);
        const position=new T.Vector3(a[offset],a[offset+1],a[offset+2]).lerp(new T.Vector3(b[offset],b[offset+1],b[offset+2]),u),
            quaternion=new T.Quaternion(a[offset+3],a[offset+4],a[offset+5],a[offset+6]).slerp(new T.Quaternion(b[offset+3],b[offset+4],b[offset+5],b[offset+6]),u);
        if(part.rootOffset&&part.rootOrientation){position.add(new T.Vector3(part.rootOffset.x,part.rootOffset.y,part.rootOffset.z).applyQuaternion(quaternion));quaternion.multiply(part.rootOrientation);}
        return {position,rotation:new T.Euler().setFromQuaternion(quaternion)};
    }
}
