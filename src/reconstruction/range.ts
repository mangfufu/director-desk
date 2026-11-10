import {t} from '../i18n/locale.ts';
import {normalizeVideoRange} from './interval.ts';

/** Source-video interval. Pointer movement and keyboard use the same clamp. */
export function createVideoRange(container:HTMLElement,onChange:(start:number,end:number,seek:number)=>void){
    container.innerHTML=`<div class="reconstruction-interval" aria-label="${t('转换范围')}"><div class="reconstruction-interval-fill"></div><button type="button" data-edge="start" role="slider" aria-label="${t('起点')}" aria-valuemin="0"></button><button type="button" data-edge="end" role="slider" aria-label="${t('终点')}" aria-valuemin="0"></button></div><div class="reconstruction-interval-values"><label>${t('起点')}<input id="recon-start" type="number" min="0" step="0.1" value="0">s</label><output></output><label>${t('终点')}<input id="recon-end" type="number" min="0" step="0.1" value="10">s</label></div>`;
    const track=container.querySelector<HTMLElement>('.reconstruction-interval')!,fill=track.firstElementChild as HTMLElement;
    const startInput=container.querySelector<HTMLInputElement>('#recon-start')!,endInput=container.querySelector<HTMLInputElement>('#recon-end')!;
    const handles=[...track.querySelectorAll<HTMLButtonElement>('[data-edge]')];
    let start=0,end=10,duration=10,minimum=.1,disabled=true,drag:{id:number,edge:string}|undefined;
    const fmt=(value:number)=>`${Math.round(value*1000)/1000}`;
    function paint(){
        const span=Math.min(duration,minimum);
        startInput.value=fmt(start);endInput.value=fmt(end);startInput.max=fmt(Math.max(0,end-span));endInput.min=fmt(start+span);endInput.max=fmt(duration);
        fill.style.left=`${start/duration*100}%`;fill.style.width=`${(end-start)/duration*100}%`;
        for(const [i,handle] of handles.entries()){
            const value=i?end:start;handle.style.left=`${value/duration*100}%`;handle.setAttribute('aria-valuenow',fmt(value));handle.setAttribute('aria-valuemax',fmt(duration));handle.disabled=disabled;
        }
        startInput.disabled=endInput.disabled=disabled;track.classList.toggle('disabled',disabled);
        container.querySelector('output')!.textContent=`${fmt(end-start)} s`;
    }
    function change(edge:string,value:number){
        if(disabled||!Number.isFinite(value)){paint();return;}
        value=Math.round(value*10)/10;
        const span=Math.min(duration,minimum);
        if(edge==='start')start=Math.max(0,Math.min(value,end-span));else end=Math.min(duration,Math.max(value,start+span));
        paint();onChange(start,end,edge==='start'?start:end);
    }
    const pointerValue=(e:PointerEvent)=>{const box=track.getBoundingClientRect();return Math.max(0,Math.min(1,(e.clientX-box.left)/box.width))*duration;};
    track.onpointerdown=e=>{
        if(disabled||e.button!==0)return;
        const value=pointerValue(e),edge=(e.target as HTMLElement).dataset.edge||(Math.abs(value-start)<=Math.abs(value-end)?'start':'end');
        e.preventDefault();drag={id:e.pointerId,edge};track.setPointerCapture(e.pointerId);track.classList.add('dragging');change(edge,value);
    };
    track.onpointermove=e=>{if(drag?.id===e.pointerId)change(drag.edge,pointerValue(e));};
    const finish=(e:PointerEvent)=>{if(drag?.id!==e.pointerId)return;drag=undefined;track.classList.remove('dragging');if(track.hasPointerCapture(e.pointerId))track.releasePointerCapture(e.pointerId);};
    track.onpointerup=finish;track.onpointercancel=finish;track.onlostpointercapture=finish;
    for(const handle of handles)handle.onkeydown=e=>{
        let value=handle.dataset.edge==='start'?start:end,step=e.shiftKey?1:.1;
        if(e.key==='ArrowLeft'||e.key==='ArrowDown')value-=step;else if(e.key==='ArrowRight'||e.key==='ArrowUp')value+=step;
        else if(e.key==='Home')value=0;else if(e.key==='End')value=duration;else return;
        e.preventDefault();e.stopPropagation();change(handle.dataset.edge!,value);
    };
    startInput.onchange=()=>change('start',Number(startInput.value));endInput.onchange=()=>change('end',Number(endInput.value));
    paint();
    return {
        get value(){return {start,end};},
        set(startValue:number,endValue:number,total:number){duration=Math.max(.001,Number.isFinite(total)?total:0);({start,end}=normalizeVideoRange(startValue,endValue,duration,minimum));paint();},
        setMinimum(value:number){minimum=value;start=Math.min(start,Math.max(0,duration-minimum));({start,end}=normalizeVideoRange(start,end,duration,minimum));paint();},
        enable(value:boolean){if(disabled===!value)return;disabled=!value;paint();},
    };
}
