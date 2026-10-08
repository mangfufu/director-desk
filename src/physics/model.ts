import type { Entity, Project, Vec3 } from '../model.ts';
import { findAsset } from '../asset-catalog.ts';

export interface PhysicsWorld { enabled: boolean; gravity: Vec3; ground: boolean }
export interface PhysicsImpulse { time: number; impulse: Vec3; point: Vec3 }
export interface PhysicsBody {
    enabled: boolean;
    mode: 'dynamic' | 'kinematic' | 'static';
    gravity: boolean; collisions: boolean; inertia: boolean; ragdoll: boolean;
    shape: 'auto' | 'box' | 'sphere';
    start: number; mass: number; friction: number; restitution: number; damping: number;
    velocity: Vec3; angularVelocity: Vec3; impulses: PhysicsImpulse[];
}
export const defaultPhysicsWorld = (): PhysicsWorld => ({enabled:true, gravity:[0,-9.81,0], ground:true});
export const defaultPhysicsBody = (): PhysicsBody => ({enabled:true, mode:'dynamic', gravity:true, collisions:true, inertia:true, ragdoll:false,
    shape:'auto', start:0, mass:1, friction:.5, restitution:.15, damping:.05, velocity:[0,0,0], angularVelocity:[0,0,0], impulses:[]});
export function canUsePhysics(e: Entity) { return ['actor','prop'].includes(e.kind) && !e.light && !e.visual && !e.field && !e.warp && !e.handBinding && !e.structureLink; }
export function canUseRagdoll(e: Entity) {
    return e.kind === 'actor' && (e.external ? !!e.external.rig : ['human','human-legacy'].includes(findAsset(e.asset)?.capabilities?.rig ?? (['person','woman'].includes(e.asset)?'human-legacy':'')));
}
const record = (v:unknown):v is Record<string,unknown> => !!v && typeof v==='object' && !Array.isArray(v);
function keys(v:Record<string,unknown>, allowed:string[]) { if(Object.keys(v).some(k=>!allowed.includes(k)))throw Error('未知物理参数'); }
function vector(v:unknown,limit=10000):v is Vec3 { return Array.isArray(v)&&v.length===3&&v.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=limit); }
function number(v:unknown,min:number,max:number) { return typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max; }
export function assertPhysics(p:Project) {
    const w=p.physics;
    if(w!==undefined) {
        if(!record(w))throw Error('物理场景参数错误'); keys(w,['enabled','gravity','ground']);
        if(typeof w.enabled!=='boolean'||typeof w.ground!=='boolean'||!vector(w.gravity,1000))throw Error('物理场景参数错误');
    }
    for(const e of p.entities) {
        const b=e.physics; if(b==null)continue;
        if(!record(b)||b.enabled&&!canUsePhysics(e))throw Error('该对象不能启用物理；请先解除手持或结构绑定');
        keys(b,['enabled','mode','gravity','collisions','inertia','ragdoll','shape','start','mass','friction','restitution','damping','velocity','angularVelocity','impulses']);
        if(!['enabled','gravity','collisions','inertia','ragdoll'].every(k=>typeof b[k]==='boolean')||!['dynamic','kinematic','static'].includes(b.mode as string)||!['auto','box','sphere'].includes(b.shape as string)
            ||!number(b.start,0,p.duration)||!number(b.mass,.01,100000)||!number(b.friction,0,2)||!number(b.restitution,0,1)||!number(b.damping,0,1)||!vector(b.velocity,1000)||!vector(b.angularVelocity,100)||!Array.isArray(b.impulses)||b.impulses.length>256)throw Error('物理参数超出范围');
        if(b.ragdoll && (!canUseRagdoll(e)||b.mode!=='dynamic'))throw Error('布娃娃需要人形骨架与动态模式');
        let previous=-1;
        for(const i of b.impulses){if(!record(i))throw Error('受力事件错误');keys(i,['time','impulse','point']);
            if(!number(i.time,b.start,p.duration)||i.time<previous||!vector(i.impulse,100000)||!vector(i.point,1000))throw Error('受力时间需按顺序排列，且不早于物理开始时间');previous=i.time;}
    }
}
