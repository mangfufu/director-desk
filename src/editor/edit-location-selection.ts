import { pathSections, type TimelineSelection } from '../clip-editing.ts';
import type { Project } from '../model.ts';
import type { EditLocation } from '../automation/edit-locations.ts';
import { visibilityClips } from '../scenes/visibility.ts';

/** Resolve a historical receipt against today's scene; never resurrect old clips. */
export function selectionForEdit(project: Project, row: EditLocation) {
    const start = Math.max(0, Math.min(project.duration, row.start));
    const end = Math.max(start, Math.min(project.duration, row.end));
    const entity = project.entities.find(e => e.id === row.entityId);
    const clips: TimelineSelection[] = [];
    const overlaps = (a: number, b: number) => end > start ? a < end && b > start : a <= start && b > start;
    if (entity && row.field === '动作') {
        for (const clip of entity.clips) if (overlaps(clip.start, clip.end)) clips.push({kind:'action',entityId:entity.id,id:clip.id});
    } else if(entity && row.field==='显示时段') {
        for(const clip of visibilityClips(entity,project.duration)) if(overlaps(clip.start,clip.end))clips.push({kind:'visibility',entityId:entity.id,id:clip.id});
    } else if (entity?.path && entity.path.points.length > 1 && row.field === '运动路径') {
        pathSections(entity.path).forEach((part,index) => {
            if (overlaps(part.start,part.end)) clips.push({kind:'path',entityId:entity.id,index});
        });
    } else if (row.field === '切镜' || (entity?.camera && row.field === '摄影机')) {
        project.cuts.forEach((cut,index) => {
            if ((!entity || cut.cameraId === entity.id) && overlaps(cut.time,project.cuts[index+1]?.time ?? project.duration)) clips.push({kind:'cut',index});
        });
    }
    return {entityIds:entity ? [entity.id] : [], clips, timeRange:{start,end}};
}
