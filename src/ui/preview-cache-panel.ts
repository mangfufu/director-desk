import type { AppContext } from '../app-context.ts';
import { editorSelection } from '../editor/timeline-selection.ts';
import { buildPreviewCache, currentPreview, clearPreviewCache, previewCacheEpoch } from '../editor/preview-cache-runtime.ts';
import { escape } from './common.ts';
import { t } from '../i18n/locale.ts';
import './preview-cache-panel.css';

export async function openPreviewCache(ctx:AppContext){
    if(ctx.busy||ctx.draft||ctx.history.pending)return;
    if(document.querySelector('.preview-cache-modal'))return;
    ctx.playing=false;ctx.updateTimeUI();
    let frames=await currentPreview(ctx),active=true,working=false,playing=false,index=0,origin=0,raf=0,decoding=false,generation=0,aborter:AbortController|undefined;
    if(ctx.busy||ctx.draft||ctx.history.pending||document.querySelector('.preview-cache-modal'))return;
    const selected=editorSelection(ctx.project,ctx.selected).timeRange;
    const start=frames?.start??selected?.start??ctx.time,end=frames?.end??selected?.end??Math.min(ctx.project.duration,start+5);
    if (!ctx.showModal('局部预览',`<div class="preview-cache-settings"><label>开始 / 秒<input id="cached-start" type="number" min="0" value="${Math.min(start,Math.max(0,ctx.project.duration-1/ctx.project.fps))}" step="0.01"></label><label>结束 / 秒<input id="cached-end" type="number" min="0" value="${end}" step="0.01"></label><label>分辨率<select id="cached-size"><option value="640">640</option><option value="1280">1280</option></select></label><label>摄影机<select id="cached-camera"><option value="program">按切镜</option>${ctx.project.entities.filter(e=>e.kind==='camera').map(e=>`<option value="${escape(e.id)}">${escape(e.name)}</option>`).join('')}</select></label></div><canvas id="cached-frame"></canvas><div class="preview-cache-transport"><button id="cached-play">播放</button><input id="cached-seek" type="range" min="0" max="0" step="1" value="0" aria-label="预览时间"><span id="cached-time"></span></div><div id="cached-status" role="status"></div>`, '<button id="cached-clear">清除预览</button><button id="cached-cancel" disabled>取消</button><button id="cached-build">生成预览</button>')) return;
    const modal=document.querySelector<HTMLElement>('.modal')!;modal.classList.add('preview-cache-modal');
    const el=<T extends HTMLElement=HTMLButtonElement>(id:string)=>modal.querySelector<T>('#cached-'+id)!;
    const canvas=el<HTMLCanvasElement>('frame'),context=canvas.getContext('2d')!,seek=el<HTMLInputElement>('seek');
    el<HTMLSelectElement>('size').value=String(frames?.size??640);el<HTMLSelectElement>('camera').value=frames?.cameraId??ctx.preview;
    let shown=-1,rangeEdited=false,seenEpoch=previewCacheEpoch(ctx);
    function stop(){playing=false;el('play').textContent=t('播放');}
    function reset(){stop();index=0;generation++;shown=-1;context.clearRect(0,0,canvas.width,canvas.height);seek.value='0';el('time').textContent='';}
    function controls(){
        el('build').disabled=working;el('cancel').disabled=!working;el('clear').disabled=working;
        el('play').disabled=working||!frames;seek.disabled=working||!frames;
        for(const key of ['start','end','size','camera'])el<HTMLInputElement>(key).disabled=working;
        seek.max=String(Math.max(0,(frames?.frames.length??1)-1));
    }
    async function draw(next:number){
        if(decoding||!frames||next===shown)return;decoding=true;
        const current=frames,token=generation;
        let bitmap:ImageBitmap|undefined;
        try{
            bitmap=await createImageBitmap(current.frames[next]);
            if(!active||token!==generation||frames!==current)return;
            if(canvas.width!==current.width||canvas.height!==current.height){canvas.width=current.width;canvas.height=current.height;}
            context.drawImage(bitmap,0,0);shown=next;seek.value=String(next);
            el('time').textContent=`${(current.start+next/current.fps).toFixed(2)} / ${current.end.toFixed(2)}`;
        }catch(error){stop();el('status').textContent=(error as Error).message;}
        finally{bitmap?.close();decoding=false;}
    }
    const currentStamp=()=>`${ctx.revision}:${ctx.scenes.context.sceneId}:${previewCacheEpoch(ctx)}:${ctx.engine.pluginHooks.revision}`;
    let stamp=currentStamp(),checking=false;
    function tick(now:number){
        if(!active)return;raf=requestAnimationFrame(tick);
        const nextStamp=currentStamp();
        if(nextStamp!==stamp&&!checking&&!working){
            checking=true;reset();frames=undefined;stamp=nextStamp;
            void currentPreview(ctx).then(current=>{
                if(!active)return;
                const externalChange=seenEpoch!==previewCacheEpoch(ctx);seenEpoch=previewCacheEpoch(ctx);
                frames=rangeEdited&&!externalChange?undefined:current;
                if(frames&&externalChange){
                    rangeEdited=false;el<HTMLInputElement>('start').value=String(frames.start);el<HTMLInputElement>('end').value=String(frames.end);
                    el<HTMLSelectElement>('size').value=String(frames.size);el<HTMLSelectElement>('camera').value=frames.cameraId;
                }
                if(!frames){reset();el('status').textContent=t('场景已修改，请重新生成预览');}controls();
            }).catch(error=>{if(active){reset();frames=undefined;el('status').textContent=(error as Error).message;controls();}}).finally(()=>{checking=false;});
        }
        if(working||checking||!frames)return;
        if(playing)index=Math.floor((now-origin)*frames.fps/1000)%frames.frames.length;
        void draw(index);
    }
    el('play').onclick=()=>{if(!frames)return;if(playing)stop();else{playing=true;origin=performance.now()-index/frames.fps*1000;el('play').textContent=t('暂停');}};
    seek.oninput=()=>{stop();index=Number(seek.value);};
    for(const key of ['start','end','size','camera'])el(key).onchange=()=>{rangeEdited=true;frames=undefined;reset();controls();};
    el('clear').onclick=()=>{clearPreviewCache(ctx);frames=undefined;reset();el('status').textContent='';controls();};
    el('cancel').onclick=()=>aborter?.abort();
    el('build').onclick=()=>void (async()=>{
        if(ctx.busy)return;stop();reset();frames=undefined;working=ctx.busy=true;ctx.updateTimeUI();controls();aborter=new AbortController();
        try{
            await buildPreviewCache(ctx,{start:Number(el<HTMLInputElement>('start').value),end:Number(el<HTMLInputElement>('end').value),size:Number(el<HTMLSelectElement>('size').value) as 640|1280,cameraId:el<HTMLSelectElement>('camera').value},aborter.signal,p=>{if(active)el('status').textContent=`${Math.round(p*100)}%`;});
            frames=await currentPreview(ctx);rangeEdited=false;seenEpoch=previewCacheEpoch(ctx);stamp=currentStamp();index=0;if(active)el('status').textContent=t('预览已就绪');
        }catch(error){if(active)el('status').textContent=aborter.signal.aborted?t('已取消'):(error as Error).message;}
        finally{aborter=undefined;working=ctx.busy=false;ctx.updateTimeUI();if(active)controls();}
    })();
    modal.addEventListener('director-before-close',()=>{active=false;stop();aborter?.abort();cancelAnimationFrame(raf);generation++;frames=undefined;canvas.width=canvas.height=1;});
    controls();raf=requestAnimationFrame(tick);
}
