import type { Entity } from '../model.ts';
export interface VisibilityClip { id: string; start: number; end: number }
export function visibilityClips(entity: Entity, duration: number): VisibilityClip[] {
    return entity.visibility ?? [{id:'all',start:0,end:duration}];
}
export function entityVisibleAt(entity: Entity, time: number) {
    return entity.visible && (entity.visibility == null || entity.visibility.some(c => time >= c.start && time < c.end));
}
export function assertVisibility(value: unknown) {
    if (value == null) return;
    if (!Array.isArray(value) || value.length > 10000) throw Error('显示时段需要片段数组');
    const ids=new Set<string>();
    for (const c of value) {
        if (!c || typeof c !== 'object' || Object.keys(c).some(k=>!['id','start','end'].includes(k)) || typeof c.id !== 'string' || !/^[\p{L}\p{N}_:.-]{1,200}$/u.test(c.id) || ids.has(c.id)
            || !Number.isFinite(c.start) || !Number.isFinite(c.end) || c.start < 0 || c.end <= c.start) throw Error('显示片段的标识或时间无效');
        ids.add(c.id);
    }
    const sorted=[...value].sort((a,b)=>a.start-b.start);
    for(let i=1;i<sorted.length;i++) if(sorted[i].start<sorted[i-1].end) throw Error('显示片段不能重叠');
}
