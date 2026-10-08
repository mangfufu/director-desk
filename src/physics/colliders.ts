import * as T from 'three';
import * as C from 'cannon-es';
import type { PhysicsBody } from './model.ts';

export const cv = (v:T.Vector3) => new C.Vec3(v.x,v.y,v.z);
export const cq = (q:T.Quaternion) => new C.Quaternion(q.x,q.y,q.z,q.w);
/** Geometry bounds only: no vertex scans while scrubbing dense imported models. */
export function addCollider(body:C.Body,root:T.Object3D,shape:PhysicsBody['shape'],compound:boolean,respectVisibility=true,centered=false) {
    root.updateWorldMatrix(true,true);
    const position=root.getWorldPosition(new T.Vector3()),rotation=root.getWorldQuaternion(new T.Quaternion());
    const frame=new T.Matrix4().compose(position,rotation,new T.Vector3(1,1,1)).invert();
    const boxes:{size:T.Vector3;center:T.Vector3;rotation:T.Quaternion;sphere:boolean}[]=[];
    root.traverse(node=>{
        if(!(node instanceof T.Mesh))return;
        if(respectVisibility)for(let current:T.Object3D|null=node;current&&current!==root;current=current.parent)if(!current.visible)return;
        const geometry=node.geometry; if(!geometry.boundingBox)geometry.computeBoundingBox(); if(!geometry.boundingBox)return;
        const matrix=frame.clone().multiply(node.matrixWorld),p=new T.Vector3(),q=new T.Quaternion(),s=new T.Vector3();matrix.decompose(p,q,s);
        const center=geometry.boundingBox.getCenter(new T.Vector3()).applyMatrix4(matrix),size=geometry.boundingBox.getSize(new T.Vector3()).multiply(s);
        size.set(Math.abs(size.x),Math.abs(size.y),Math.abs(size.z));
        const params=geometry instanceof T.SphereGeometry?geometry.parameters:undefined;
        const sphere=!!params && Math.abs(params.phiLength-Math.PI*2)<1e-6 && Math.abs(params.thetaLength-Math.PI)<1e-6 &&
            Math.max(size.x,size.y,size.z)-Math.min(size.x,size.y,size.z)<Math.max(size.x,size.y,size.z)*1e-4;
        if(size.length()>0)boxes.push({center,size,rotation:q,sphere});
    });
    if(!boxes.length)return false;
    const autoSphere=shape==='auto' && boxes.length===1 && boxes[0].sphere;
    if(autoSphere)body.addShape(new C.Sphere(Math.max(boxes[0].size.x,boxes[0].size.y,boxes[0].size.z)/2),cv(boxes[0].center));
    else if(compound && shape==='auto' && boxes.length<128)for(const b of boxes)body.addShape(new C.Box(cv(b.size.clone().multiplyScalar(.5).max(new T.Vector3(.015,.015,.015)))),cv(b.center),cq(b.rotation));
    else {
        const box=new T.Box3(); for(const b of boxes)box.union(new T.Box3(b.size.clone().multiplyScalar(-.5),b.size.clone().multiplyScalar(.5)).applyMatrix4(new T.Matrix4().compose(b.center,b.rotation,new T.Vector3(1,1,1))));
        const size=box.getSize(new T.Vector3()).multiplyScalar(.5).max(new T.Vector3(.015,.015,.015));
        body.addShape(shape==='sphere'?new C.Sphere(Math.max(size.x,size.y,size.z)):new C.Box(cv(size)),cv(box.getCenter(new T.Vector3())));
    }
    body.position.copy(cv(position));body.quaternion.copy(cq(rotation));
    // Movable rigid bodies have one enclosing shape. Keep their mass at its center;
    // the renderer's grounded/imported pivot is restored separately by the runtime.
    if(centered && body.shapes.length===1){
        const shift=body.shapeOffsets[0].clone();body.quaternion.vmult(shift,shift);body.position.vadd(shift,body.position);
        body.shapeOffsets[0].set(0,0,0);body.updateBoundingRadius();body.updateMassProperties();
    }
    return true;
}
