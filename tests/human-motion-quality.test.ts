import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { authoredCurve } from '../src/animation/authored-curve.ts';
import { AUTHORED_HUMAN_ACTIONS } from '../src/assets/authored-human-actions.ts';
import { makeHuman } from '../src/assets/humanoid.ts';
import { sampleHumanAction, sampleHumanBody } from '../src/assets/human-animation.ts';
import { disposeTree } from '../src/assets/dispose.ts';
import { entity, clip, type Action } from '../src/model.ts';

test('authored easing keeps holds exact and moves monotonically through increasing or decreasing keys', () => {
    for (const direction of [1,-1]) for (const left of [0,.1,1,10]) for (const right of [0,.1,1,10]) {
        let before = 0;
        for (let i=0;i<=200;i++) { const value = authoredCurve(0,direction,left*direction,direction,right*direction,1,i/200)*direction;
            assert.ok(value >= before-1e-10 && value >= -1e-10 && value <= 1+1e-10); before=value; }
    }
    for(let i=0;i<=100;i++)assert.equal(authoredCurve(15,15,2,0,-3,.3,i/100),15);
});
test('authored easing joins velocity and acceleration across unequal key intervals', () => {
    const h=1e-5, left=(t:number)=>authoredCurve(0,1,0,2,1,.5,t/.5), right=(t:number)=>authoredCurve(1,2,2,1,0,1,t);
    const vl=(left(.5)-left(.5-h))/h, vr=(right(h)-right(0))/h;
    const al=(left(.5)-2*left(.5-h)+left(.5-2*h))/(h*h), ar=(right(2*h)-2*right(h)+right(0))/(h*h);
    assert.ok(Math.abs(vl-vr)<1e-5); assert.ok(Math.abs(al-ar)<.01);
    assert.ok(vl>1,'an intermediate key must not introduce a stop');
});
test('all 23 manually keyed actions keep bone velocity continuous at interior keys and loop seams', () => {
    const e=entity('actor','human-adult','quality'), rig=makeHuman(e), h=1e-5;
    const bones=[rig.hips,...Object.values(rig.joints)];
    const state=(at:number)=>{sampleHumanAction(rig,e,at);return bones.map(b=>b.quaternion.clone());};
    const speed=(a:T.Quaternion,b:T.Quaternion)=>{const d=a.clone().invert().multiply(b);if(d.w<0)d.set(-d.x,-d.y,-d.z,-d.w);return new T.Vector3(d.x,d.y,d.z).multiplyScalar(2/h);};
    try { for(const [action,motion] of Object.entries(AUTHORED_HUMAN_ACTIONS)) {
        e.clips=[clip(action as Action,0,motion.duration*3)];
        // One shots use normalized clip progress, loops use the authored cycle length.
        const duration=motion.loop?motion.duration:e.clips[0].end;
        const times=motion.keys.slice(1,-1).map(k=>k.time*duration);if(motion.loop)times.push(duration);
        for(const at of times){const a=state(at-h),b=state(at),c=state(at+h);
            for(let i=0;i<bones.length;i++)assert.ok(speed(a[i],b[i]).distanceTo(speed(b[i],c[i]))<.02,`${action}/${at}/${i}: velocity jump`);
        }
    }} finally {disposeTree(rig.root);}
});
test('remodeled human surfaces have outward normals, aligned UV seam shading and bounded geometry cost', () => {
    for(const asset of ['human-adult','human-female','human-child','human-dwarf','human-giant','human-full','person']) {
        const rig=makeHuman(entity('actor',asset,asset)); let triangles=0;
        try {rig.root.traverse(o=>{if(!(o instanceof T.Mesh))return;const g=o.geometry,pos=g.getAttribute('position'),norm=g.getAttribute('normal');
            triangles+=(g.index?.count??pos.count)/3;for(let i=0;i<norm.count;i++)assert.ok(Number.isFinite(norm.getX(i)+norm.getY(i)+norm.getZ(i)),asset+' normal');
        });assert.ok(triangles<9000,`${asset}: ${triangles} triangles`);
        const torso=rig.joints.torso.children[0] as T.Mesh, p=torso.geometry.getAttribute('position'),n=torso.geometry.getAttribute('normal');
        let radial=0;for(let i=0;i<p.count;i++)radial+=p.getX(i)*n.getX(i)+p.getZ(i)*n.getZ(i);
        assert.ok(radial>0,asset+' inward torso');
        }finally{disposeTree(rig.root);}
    }
});
test('the wave keeps the hand alongside the face rather than extending at chest height', () => {
    const e=entity('actor','human-adult','quality'),r=makeHuman(e);e.clips=[clip('wave',0,3)];
    try {for(const at of [.25,.5,.75,1,1.25,1.5]){sampleHumanAction(r,e,at);r.root.updateMatrixWorld(true);
        const hand=r.joints.rightElbow.localToWorld(new T.Vector3(0,-.3,0)),head=r.head.getWorldPosition(new T.Vector3());
        assert.ok(hand.y>head.y+.06 && hand.y<head.y+.35);assert.ok(Math.abs(hand.x-head.x)<.65);
    }}finally{disposeTree(r.root);}
});

test('clip handoffs preserve outgoing and incoming bone velocity without a frozen outgoing pose', () => {
    const e=entity('actor','human-adult','quality'),r=makeHuman(e),h=1e-5;
    const bones=[r.hips,...Object.values(r.joints)];
    const sample=(at:number)=>{sampleHumanBody(r,e,at);return bones.map(b=>b.quaternion.clone());};
    const speed=(a:T.Quaternion,b:T.Quaternion)=>{const d=a.clone().invert().multiply(b);if(d.w<0)d.set(-d.x,-d.y,-d.z,-d.w);return new T.Vector3(d.x,d.y,d.z).multiplyScalar(2/h);};
    try {for(const from of ['walk','run','wave','crawl'] as Action[])for(const to of ['walk','run','punch','lie','jump'] as Action[]){
        e.clips=[clip(from,0,1.13),clip(to,1.13,3)];
        for(const at of [1.13,1.33]){const a=sample(at-h),b=sample(at),c=sample(at+h);
            for(let i=0;i<bones.length;i++)assert.ok(speed(a[i],b[i]).distanceTo(speed(b[i],c[i]))<.025,`${from}->${to}/${at}/${i}`);
        }
    }}finally{disposeTree(r.root);}
});

test('handoffs after a gap start from the evaluated idle or held pose, including short gaps', () => {
    const e=entity('actor','human-adult','gap'),r=makeHuman(e),h=1e-6;
    const sample=(at:number)=>{sampleHumanBody(r,e,at);return [r.hips,...Object.values(r.joints)].map(b=>b.quaternion.clone());};
    try {for(const from of ['wave','run','sit','fall','turn'] as Action[])for(const gap of [.05,2]) {
        const start=1+gap;
        e.clips=[clip(from,0,1),clip('run',start,start+2)];
        const before=sample(start-h),at=sample(start);
        for(let i=0;i<at.length;i++)assert.ok(before[i].angleTo(at[i])<.001,`${from}/gap=${gap}/bone=${i}`);
        sample(start+1);assert.deepEqual(sample(start),at,'seeking must not change the handoff');
    }}finally{disposeTree(r.root);}
});
