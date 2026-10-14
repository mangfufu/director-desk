import type { TimelineSelection } from '../clip-editing.ts';
import { selectionKey } from '../editor/timeline-selection.ts';
import type { createTimelineInsertDrag } from '../editor/timeline-insert-drag.ts';

type Plan=ReturnType<ReturnType<typeof createTimelineInsertDrag>['preview']>;

/** Solid pointer follower and translucent destinations; existing clips stay still. */
export function createTimelineMovePreview(selections:TimelineSelection[],anchor:HTMLElement,startX:number,startY:number,pps:number){
    const picked=new Set(selections.map(selectionKey));
    const items=[...document.querySelectorAll<HTMLElement>('#timeline-content [data-clip-id],#timeline-content [data-path-id]')].flatMap(bar=>{
        const s:TimelineSelection=bar.dataset.clipId?{kind:'action',entityId:bar.dataset.entity!,id:bar.dataset.clipId}:{kind:'path',entityId:bar.dataset.pathId!,index:Number(bar.dataset.section)};
        const key=selectionKey(s);if(!picked.has(key))return [];
        const rect=bar.getBoundingClientRect(),ghost=document.createElement('div'),marker=document.createElement('div');
        ghost.className='motion-drop-ghost';ghost.textContent=bar.querySelector('span')?.textContent??'';
        marker.className='timeline-insert-marker';
        return [{key,bar,ghost,marker,rect}];
    });
    const rect=anchor.getBoundingClientRect(),floating=document.createElement('div'),status=document.createElement('div');
    floating.className='timeline-drag-floating';floating.textContent=anchor.querySelector('span')?.textContent??'片段';
    if(selections.length>1)floating.textContent+=` · ${selections.length} 段`;
    floating.style.width=`${Math.min(rect.width,360)}px`;floating.style.height=`${rect.height}px`;
    status.className='motion-drop-status';
    const grab=Math.min(startX-rect.left,360),vertical=startY-rect.top;
    let active=false;
    return {
        follow(x:number,y:number){
            if(!active){active=true;document.body.append(floating,status);items.forEach(i=>{i.bar.classList.add('timeline-drag-origin');i.bar.parentElement!.append(i.ghost,i.marker);});}
            floating.style.transform=`translate3d(${x-grab}px,${y-vertical-5}px,0)`;
            status.style.transform=`translate3d(${Math.max(4,Math.min(x+14,innerWidth-300))}px,${Math.max(4,y-42)}px,0)`;
        },
        update(plan:Plan){
            const ranges=new Map(plan.edits.map(r=>[selectionKey(r.selection),r]));
            for(const i of items){
                const range=ranges.get(i.key)!;
                i.ghost.style.transform=`translateX(${range.start*pps}px)`;i.ghost.style.width=`${(range.end-range.start)*pps}px`;
                i.marker.style.transform=`translateX(${range.start*pps}px)`;
            }
            const text=`${plan.side==='before'?'插在前面':plan.side==='after'?'插在后面':'放在这里'} · ${plan.range.start.toFixed(2)}—${plan.range.end.toFixed(2)} 秒`;
            if(status.textContent!==text)status.textContent=text;
        },
        dispose(){floating.remove();status.remove();items.forEach(i=>{i.bar.classList.remove('timeline-drag-origin');i.ghost.remove();i.marker.remove();});},
    };
}
