import type {Project} from '../model.ts';
import {planMotionInsertion} from '../editor/timeline-insertion.ts';

/** Place the newly created clip using the same insertion rules in every editor. */
export function finishMotionInsertion(original:Project,after:Project,entityId:string,time:number,insert:boolean){
    const before=original.entities.find(e=>e.id===entityId),target=after.entities.find(e=>e.id===entityId);
    if(!before||!target)throw Error('动作目标不存在');
    const previous=new Set(before.clips.map(c=>c.id));
    const added=target.clips.find(c=>!previous.has(c.id));
    if(!added)throw Error('未创建动作片段');
    if(insert){
        const plan=planMotionInsertion(target.clips.filter(c=>c.id!==added.id),time,added.end-added.start,after.fps);
        Object.assign(added,{start:plan.start,end:plan.end});
        target.clips=[...plan.clips,added].sort((a,b)=>a.start-b.start);
        after.duration=Math.max(original.duration,...target.clips.map(c=>c.end));
    }
    return added;
}
