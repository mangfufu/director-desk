import {Matrix4,Quaternion,Vector3} from 'three';
export interface Landmark {x:number;y:number;z:number;visibility?:number}
export interface LiteFrame {time:number;landmarks:Landmark[][];worldLandmarks:Landmark[][]}
export const LITE_BONES=[
 ['hips',-1,[0,.9,0]],['spine',0,[0,.25,0]],['head',1,[0,.35,0]],
 ['leftUpperArm',1,[.2,.25,0]],['leftLowerArm',3,[.3,0,0]],['leftHand',4,[.25,0,0]],
 ['rightUpperArm',1,[-.2,.25,0]],['rightLowerArm',6,[-.3,0,0]],['rightHand',7,[-.25,0,0]],
 ['leftUpperLeg',0,[.1,0,0]],['leftLowerLeg',9,[0,-.43,0]],['leftFoot',10,[0,-.43,0]],
 ['rightUpperLeg',0,[-.1,0,0]],['rightLowerLeg',12,[0,-.43,0]],['rightFoot',13,[0,-.43,0]],
] as const;
const finite=(p:Landmark)=>p&&[p.x,p.y,p.z].every(Number.isFinite);
const v=(p:Landmark)=>new Vector3(p.x,-p.y,-p.z);
export function poseJoints(points:Landmark[]){
 if(points.length!==33||!points.every(finite))throw Error('识别关键点无效');
 const p=points.map(v),hips=p[23].clone().add(p[24]).multiplyScalar(.5),shoulders=p[11].clone().add(p[12]).multiplyScalar(.5);
 return [hips,hips.clone().lerp(shoulders,.5),p[7].clone().add(p[8]).multiplyScalar(.5),p[11],p[13],p[15],p[12],p[14],p[16],p[23],p[25],p[27],p[24],p[26],p[28]].map(p=>p.clone().sub(hips));
}
function basis(right:Vector3,up:Vector3){
 const y=up.clone().normalize(),x=right.clone().addScaledVector(y,-right.dot(y)).normalize(),z=x.clone().cross(y).normalize();
 if(x.lengthSq()<.5||y.lengthSq()<.5||z.lengthSq()<.5)return new Quaternion();
 return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x,y,z));
}
export function poseRotations(points:Landmark[]){
 const p=poseJoints(points),global:Quaternion[]=[],local:Quaternion[]=[];
 const aim:Record<number,[number,number]>={3:[3,4],4:[4,5],6:[6,7],7:[7,8],9:[9,10],10:[10,11],12:[12,13],13:[13,14]};
 for(let i=0;i<LITE_BONES.length;i++){
  const parent=LITE_BONES[i][1],q=parent>=0?global[parent].clone():new Quaternion();
  if(i===0)q.copy(basis(p[9].clone().sub(p[12]),p[1]));
  else if(i===1)q.copy(basis(p[3].clone().sub(p[6]),p[2].clone().sub(p[1])));
  else if(aim[i]){const [a,b]=aim[i],direction=p[b].clone().sub(p[a]);const rest=new Vector3(...LITE_BONES[b][2]);
   if(direction.lengthSq()>1e-8)q.copy(global[parent]).multiply(new Quaternion().setFromUnitVectors(rest.normalize(),direction.applyQuaternion(global[parent].clone().invert()).normalize()));
  }
  global.push(q);local.push(parent>=0?global[parent].clone().invert().multiply(q):q.clone());
 }
 return local.map(q=>q.toArray());
}
export interface LitePerson {id:number;world:Landmark[];image:Landmark[];root:[number,number,number]}
/** Screen-space association and placement are estimates, distinct from the raw model output. */
export class LiteTracker{
 private next=0;
 private tracks:{id:number;x:number;y:number;time:number;scale:number;firstY:number;hip:number}[]=[];
 update(frame:LiteFrame,aspect:number):LitePerson[]{
  const detections=frame.landmarks.map((image,i)=>({image,world:frame.worldLandmarks[i]})).filter(d=>d.image.length===33&&d.world?.length===33&&d.image.every(finite)&&d.world.every(finite)).map(d=>({...d,x:(d.image[23].x+d.image[24].x)/2,y:(d.image[23].y+d.image[24].y)/2,scale:Math.max(.05,Math.abs((d.image[11].y+d.image[12].y-d.image[23].y-d.image[24].y)/2))}));
  this.tracks=this.tracks.filter(t=>frame.time-t.time<=.7);
  const pairs=this.tracks.flatMap(t=>detections.map((d,i)=>({t,i,cost:Math.hypot((d.x-t.x)*aspect,d.y-t.y)+Math.abs(Math.log(d.scale/t.scale))*.08}))).filter(p=>p.cost<.3).sort((a,b)=>a.cost-b.cost);
  const assigned=new Map<number,typeof this.tracks[number]>(),used=new Set<number>();
  for(const pair of pairs)if(!assigned.has(pair.i)&&!used.has(pair.t.id)){assigned.set(pair.i,pair.t);used.add(pair.t.id);}
  return detections.map((d,i)=>{
   const joints=poseJoints(d.world),hip=Math.max(.2,-Math.min(joints[11].y,joints[14].y));
   let track=assigned.get(i);if(!track){track={id:this.next++,x:d.x,y:d.y,time:frame.time,scale:d.scale,firstY:d.y,hip};this.tracks.push(track);}
   Object.assign(track,{x:d.x,y:d.y,time:frame.time,scale:d.scale});
   return {id:track.id,image:d.image,world:d.world,root:[(d.x-.5)*aspect*4,Math.max(hip,track.hip+(track.firstY-d.y)*4),0]};
  });
 }
}
