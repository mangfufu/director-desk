import { clipRange, pathSections, setClipRange, type TimelineSelection } from '../clip-editing.ts';
import type { Project } from '../model.ts';
import { selectionKey } from './timeline-selection.ts';
import { insertionPoint, makeInsertionRoom } from './timeline-insertion.ts';

/** Snapshot timing once so ripple previews never accumulate across pointer events. */
export function createTimelineInsertDrag(project: Project, selections: TimelineSelection[], anchor: TimelineSelection) {
    if (selections.some(s => s.kind === 'cut') || anchor.kind === 'cut') throw Error('切镜请单独拖动');
    const picked = new Set(selections.map(selectionKey)), duration = project.duration;
    const tracks = new Map<string, { selection: TimelineSelection; start: number; end: number }[]>();
    const trackKey = (s: TimelineSelection) => s.kind === 'cut' ? 'cut' : `${s.kind}:${s.entityId}`;
    for (const s of selections) {
        if (s.kind === 'cut' || tracks.has(trackKey(s))) continue;
        const entity = project.entities.find(e => e.id === s.entityId)!;
        if (entity.locked) throw Error('对象已锁定');
        const ranges = s.kind === 'action'
            ? entity.clips.map(c => ({ selection: { kind: 'action' as const, entityId: entity.id, id: c.id }, start: c.start, end: c.end }))
            : pathSections(entity.path!).map((r, index) => ({ selection: { kind: 'path' as const, entityId: entity.id, index }, start: r.start, end: r.end }));
        tracks.set(trackKey(s), ranges);
    }
    const all = [...tracks.values()].flat(), selected = all.filter(r => picked.has(selectionKey(r.selection)));
    const beginning = Math.min(...selected.map(r => r.start));
    const anchorStart = clipRange(project, anchor).start;
    const neighbours = tracks.get(trackKey(anchor))!.filter(r => !picked.has(selectionKey(r.selection)));
    const batches=[...tracks.values()].map(ranges=>({moving:ranges.filter(r=>picked.has(selectionKey(r.selection))),rest:ranges.filter(r=>!picked.has(selectionKey(r.selection)))}));
    const pointTimes = selections.flatMap(s=>{
        if(s.kind!=='path')return [];
        const path=project.entities.find(e=>e.id===s.entityId)!.path!;
        return path.sections?[]:[{path,times:path.points.map(p=>p.time)}];
    });
    const preview=(delta:number,pointer:number,tolerance=0)=>{
        if (!Number.isFinite(delta) || !Number.isFinite(pointer)) throw Error('拖动时间无效');
        const point=insertionPoint(neighbours,pointer,anchorStart+delta,tolerance);
        const shift=Math.max(-beginning,point.start-anchorStart);
        const edits=batches.flatMap(batch=>{
            const moving=batch.moving.map(r=>({...r,start:r.start+shift,end:r.end+shift}));
            return [...moving,...makeInsertionRoom(batch.rest,moving)];
        });
        return {selections,side:point.side,range:edits.find(r=>selectionKey(r.selection)===selectionKey(anchor))!,edits,duration:Math.max(duration,...edits.map(r=>r.end))};
    };
    const commit=(plan:ReturnType<typeof preview>)=>{
        project.duration=duration;
        pointTimes.forEach(({path,times})=>path.points.forEach((p,i)=>p.time=times[i]));
        for(const r of plan.edits)setClipRange(project,r.selection,r.start,r.end);
        return plan;
    };
    return {
        affected: all.map(r => r.selection),
        preview,commit,
        apply(delta: number, pointer: number) {
            return commit(preview(delta,pointer));
        },
    };
}
