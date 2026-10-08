import type { Entity, MotionPath, Vec3 } from '../model.ts';
import { pathPosition, baseEntityYaw } from '../timeline.ts';
export function crowdOffset(e: Pick<Entity, 'count' | 'spacing'>, i: number): Vec3 {
    const columns = Math.ceil(Math.sqrt(e.count));
    return [(i % columns - (columns - 1) / 2) * e.spacing, 0, (Math.floor(i / columns) - (Math.ceil(e.count / columns) - 1) / 2) * e.spacing];
}
export function memberPathSummary(e: Entity) {
    return e.memberPaths ? { count:e.memberPaths.length, start:Math.min(...e.memberPaths.map(p=>p.points[0].time)), end:Math.max(...e.memberPaths.map(p=>p.points.at(-1)!.time)) } : undefined;
}
export function memberSample(e: Entity, i: number, time: number) {
    const path = e.memberPaths?.[i];
    const position = pathPosition(path ?? null, crowdOffset(e, i), time);
    const random = (seed: number) => { const n = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); };
    const yaw = path ? baseEntityYaw({ ...e, rotation:[0,0,0], path, face:'path' }, time, {entities:[]}) : (random(e.seed + i + 100) - .5) * .4;
    const moving = !!path && time >= path.points[0].time && time < path.points.at(-1)!.time
        && position.distanceToSquared(pathPosition(path, [0,0,0], time + .001)) > 1e-10;
    return { position, yaw, moving };
}
export function assertMemberPaths(e: Entity) {
    if (e.memberPaths == null) return;
    if (e.kind !== 'crowd' || !Array.isArray(e.memberPaths) || e.memberPaths.length !== e.count) throw Error('独立群演路线数量需与人数一致，请重新生成路线');
    for (const path of e.memberPaths as MotionPath[]) {
        if (!path || path.smooth !== false || path.sections !== undefined || path.interpolation !== undefined || !Array.isArray(path.points) || !path.points.length || path.points.length > 10000) throw Error('独立群演路线格式无效');
        for (const [i, p] of path.points.entries()) if (!p || !Number.isFinite(p.time) || p.time < 0 || i > 0 && p.time <= path.points[i-1].time
            || !Array.isArray(p.position) || p.position.length !== 3 || !p.position.every(Number.isFinite) || p.easing !== undefined || p.heading !== undefined) throw Error('独立群演路线点无效');
    }
}
