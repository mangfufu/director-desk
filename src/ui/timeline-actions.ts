import type {AppContext} from '../app-context.ts';
import {clipRange,type TimelineSelection} from '../clip-editing.ts';
import type {Project} from '../model.ts';
import {selectedClips} from '../editor/timeline-selection.ts';
import {t} from '../i18n/locale.ts';

export function timelineActionState(project:Project,selections:TimelineSelection[],time:number){
    if(!selections.length)return {reason:'先选择片段',splittable:[] as TimelineSelection[]};
    if(selections.some(s=>s.kind!=='cut'&&project.entities.find(e=>e.id===s.entityId)?.locked))return {reason:'所选对象已锁定',splittable:[] as TimelineSelection[]};
    const at=Math.round(time*project.fps)/project.fps,frame=1/project.fps;
    try{return {reason:'',splittable:selections.filter(s=>{const r=clipRange(project,s);return at-r.start>=frame-1e-8&&r.end-at>=frame-1e-8;})};}
    catch{return {reason:'请重新选择片段',splittable:[] as TimelineSelection[]};}
}

export function refreshTimelineActions(ctx:AppContext){
    const split=document.querySelector<HTMLButtonElement>('#timeline-split'),trim=document.querySelector<HTMLButtonElement>('#timeline-trim');
    if(!split||!trim)return;
    const blocked=ctx.busy?'请等待当前操作完成':ctx.history.pending||ctx.draft?'请先结束当前编辑':ctx.playing?'暂停后编辑片段':document.querySelector<HTMLSelectElement>('#timeline-mode')?.value==='preview'?'切换到编辑片段模式':'';
    const state=blocked?{reason:blocked,splittable:[]}:timelineActionState(ctx.project,selectedClips(),ctx.time);
    const splitDisabled=!!state.reason||!state.splittable.length,trimDisabled=!!state.reason;
    if(split.disabled!==splitDisabled)split.disabled=splitDisabled;
    if(trim.disabled!==trimDisabled)trim.disabled=trimDisabled;
    const splitTitle=t(state.reason||(!state.splittable.length?'将播放头移入选中片段':'在播放头处分割 · Ctrl+B'));
    const trimTitle=t(state.reason||'调整选中片段的时间 · 双击片段');
    if(split.title!==splitTitle)split.title=splitTitle;
    if(trim.title!==trimTitle)trim.title=trimTitle;
}
