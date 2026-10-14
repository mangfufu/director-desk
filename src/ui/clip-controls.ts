import type { AppContext } from '../app-context.ts';
import { clipRange, splitClip, deleteClip, setClipRange, type TimelineSelection } from '../clip-editing.ts';
import { $ } from './common.ts';
import { selectedClips, setSelectedClips, clipSelected, clearTimelineSelection } from '../editor/timeline-selection.ts';
import { createTimelineGroupDrag } from '../editor/timeline-group-drag.ts';
export function selectClip(s: TimelineSelection | null) { if(s)setSelectedClips([s]);else clearTimelineSelection(); }
export function currentClipSelection() { return selectedClips().at(-1) ?? null; }
export function clipFromBar(bar:HTMLElement):TimelineSelection {
    if(bar.dataset.cut!==undefined) return {kind:'cut',index:Number(bar.dataset.cut)};
    if(bar.dataset.pathId) return {kind:'path',entityId:bar.dataset.pathId,index:Number(bar.dataset.section ?? 0)};
    return {kind:'action',entityId:bar.dataset.entity!,id:bar.dataset.clipId!};
}
export const isSelected = clipSelected;
export function bindClipControls(ctx:AppContext) {
    const run=(fn:()=>void)=>{ if(ctx.busy || ctx.draft || ctx.history.pending) return; try {fn();} catch(e) {ctx.toast((e as Error).message,true);} };
    const ordered=()=>selectedClips().sort((a,b)=>('index' in b?b.index:0)-('index' in a?a.index:0));
    const split=()=>run(()=>{
        const selections=ordered().filter(s=>{const r=clipRange(ctx.project,s);return ctx.time>r.start && ctx.time<r.end;});
        if(!selections.length)throw Error('请把播放头移到选中片段内部');
        let next:TimelineSelection[]=[];
        if(ctx.change(()=>{next=selections.map(s=>splitClip(ctx.project,s,ctx.time));},false)){setSelectedClips(next);ctx.renderTimeline();}
    });
    const trim=()=>run(()=>{
        const selected=currentClipSelection(), group=selectedClips();
        if(group.length>1){
            ctx.showModal('批量调整片段',`<label class="field">整体移动 / 秒<input id="clip-group-offset" type="number" step="${1/ctx.project.fps}" value="0"></label><label class="field">各片段延长 / 秒<input id="clip-group-duration" type="number" step="${1/ctx.project.fps}" value="0"></label>`,`<button id="apply-clip-time">应用</button>`);
            $('#apply-clip-time').onclick=()=>{const frame=(n:number)=>Math.round(n*ctx.project.fps)/ctx.project.fps;let next=group;
                if(ctx.change(()=>{next=createTimelineGroupDrag(ctx.project,group,group[0]).apply(frame(Number($('#clip-group-offset').value)),false);next=createTimelineGroupDrag(ctx.project,next,next[0]).apply(frame(Number($('#clip-group-duration').value)),true);},false)){setSelectedClips(next);ctx.closeModal();ctx.renderTimeline();}};
            return;
        }
        if(!selected) throw Error('先点击选择动作、路径或切镜片段');
        const s=selected,{start,end}=clipRange(ctx.project,s);
        ctx.showModal(s.kind==='cut'?'镜头时长':'片段时间',`<div class="field-pair"><label class="field">开始 / 秒<input id="clip-start" type="number" min="0" step="${1/ctx.project.fps}" value="${start}"></label><label class="field">结束 / 秒<input id="clip-end" type="number" min="0" step="${1/ctx.project.fps}" value="${end}"></label></div><label class="field">持续 / 秒<input id="clip-duration" type="number" min="${1/ctx.project.fps}" step="${1/ctx.project.fps}" value="${end-start}"></label>`,`<button id="apply-clip-time">应用</button>`);
        const a=$<HTMLInputElement>('#clip-start'),b=$<HTMLInputElement>('#clip-end'),d=$<HTMLInputElement>('#clip-duration');
        if(s.kind==='cut' && s.index===0) a.disabled=true;
        a.oninput=b.oninput=()=>d.value=String(Number(b.value)-Number(a.value));
        d.oninput=()=>b.value=String(Number(a.value)+Number(d.value));
        $('#apply-clip-time').onclick=()=>{
            const frame=(n:number)=>Math.round(n*ctx.project.fps)/ctx.project.fps;
            if(ctx.change(()=>{setClipRange(ctx.project,s,frame(Number(a.value)),frame(Number(b.value)));},false))ctx.closeModal();
        };
    });
    const remove=()=>run(()=>{const group=ordered();if(group.length && ctx.change(()=>group.forEach(s=>deleteClip(ctx.project,s)),false)){selectClip(null);ctx.renderTimeline();}});
    document.addEventListener('click',ev=>{ const el=(ev.target as HTMLElement).closest<HTMLElement>('[data-edit-path-section]'); if(el){selectClip({kind:'path',entityId:el.dataset.owner!,index:Number(el.dataset.editPathSection)});trim();} });
    $('#timeline-content').addEventListener('edit-selected-clip',trim);
    $('#timeline-content').addEventListener('delete-selected-clips',remove);
    $('#timeline-split').addEventListener('click',split);
    $('#timeline-trim').addEventListener('click',trim);
    document.addEventListener('keydown',ev=>{
        if(['INPUT','TEXTAREA','SELECT'].includes((ev.target as HTMLElement).tagName) || $('#modal-root').children.length) return;
        if((ev.ctrlKey||ev.metaKey) && ev.code==='KeyB') {ev.preventDefault();ev.stopImmediatePropagation();split();}
        if(ev.key==='Delete' && $('#timeline-content').contains(document.activeElement) && currentClipSelection()) {ev.preventDefault();ev.stopImmediatePropagation();remove();}
    },true);
}
