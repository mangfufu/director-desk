import type {AppContext} from '../app-context.ts';
import {createVideoRange} from '../reconstruction/range.ts';
import {minimumAnalysisDuration,assertAnalysisDuration} from '../reconstruction/interval.ts';
import {createReconstructionPreview} from '../reconstruction/preview.ts';
import {reconstruction} from '../reconstruction/client.ts';
import {createReconstructionResultUI} from './reconstruction-result.ts';
import {createToolService} from '../automation/service.ts';
import {icon,options} from './common.ts';
import {HUMAN_ASSETS} from '../assets/catalog/humans.ts';
import {t} from '../i18n/locale.ts';
import {paintReconstructionModes} from './reconstruction-model-options.ts';
import {paintInstallProgress} from './reconstruction-install-progress.ts';
import {openReconstructionSettings} from './video-reconstruction-settings.ts';
import './video-reconstruction-panel.css';

const workspaces=new WeakMap<AppContext,{close:()=>void}>();
const resultChoices=new WeakMap<AppContext,{jobId:string,choices:Map<string,string>}>();
const drafts=new WeakMap<AppContext,{path:string,start:string,seconds:string,fps:string,scene:string,actorModel:string}>();
export async function openVideoReconstruction(ctx:AppContext){
    if(workspaces.has(ctx)){document.querySelector<HTMLButtonElement>('#recon-choose')?.focus();return;}
    const initial=await reconstruction('state');if(workspaces.has(ctx))return;
    ctx.playing=false;ctx.updateTimeUI();
    const app=document.querySelector<HTMLElement>('#app')!;
    const mounts=[['.sidebar','reconstruction-sources',`<div class="reconstruction-heading"><strong>视频</strong><button id="recon-back" class="subtle">${icon('arrowLeft')}返回编辑</button></div><div class="reconstruction-source-list"><button id="recon-choose" class="wide">${icon('plus')}选择视频</button><input id="recon-video" type="hidden"><div id="recon-file" class="reconstruction-source-item" hidden>${icon('image')}<span id="recon-filename"></span></div></div>`],
        ['.center','reconstruction-workspace',`<div class="reconstruction-heading"><strong>视频反推</strong><div class="reconstruction-view-tabs" role="group" aria-label="预览布局"><button data-recon-view="source">原视频</button><button data-recon-view="split" aria-pressed="true">并排</button><button data-recon-view="result">识别</button></div></div>
        <div class="reconstruction-viewports" data-view="split"><section id="recon-source-pane" class="viewport-panel"><div class="panel-topline"><span>原视频</span></div><div class="reconstruction-picture"><video id="recon-video-player" controls preload="metadata" hidden></video><img id="recon-source-frame" alt="当前分析画面" hidden><div id="recon-source-empty" class="reconstruction-empty"><span>${icon('image')}</span><button id="recon-empty-choose">选择视频</button></div></div></section><section id="recon-result-pane" class="viewport-panel"><div class="panel-topline"><span id="recon-result-title">识别预览</span><button id="recon-follow" class="subtle" hidden>跟随镜头</button></div><div class="reconstruction-picture"><div id="recon-space"></div><p id="recon-result-empty" class="reconstruction-empty">等待转换</p></div></section></div>
        <div id="recon-result-transport" class="reconstruction-review" hidden></div><div id="recon-interval" class="reconstruction-interval-panel"></div><div id="recon-review" class="reconstruction-review" hidden><label for="recon-review-frame">识别回看</label><input id="recon-review-frame" type="range" min="0" max="0" step="1" value="0"><button id="recon-live" class="subtle">最新</button></div><div class="reconstruction-taskbar"><output id="recon-frame"></output><span id="recon-message" role="status" aria-live="polite"></span><progress id="recon-progress" max="100" hidden aria-label="任务进度"></progress></div>`],
        ['.inspector','reconstruction-controls',`<div class="reconstruction-heading"><strong>转换</strong><button id="recon-configure" class="icon-button subtle" title="视频反推设置" aria-label="视频反推设置">${icon('settings')}</button></div><div class="reconstruction-fields"><details id="recon-options" open><summary>转换设置</summary><div class="reconstruction-options"><label class="field"><span>识别方式</span><select id="recon-engine"><option value="mediapipe">简易识别（默认）</option><option value="human3r">标准识别</option></select></label><label id="recon-people-count-field" class="field" hidden><span>最多识别人数</span><input id="recon-people-count" type="number" min="1" max="10" step="1" value="3"></label><label class="field"><span>分析精度</span><select id="recon-fps"><option value="3">快速</option><option value="6" selected>标准</option><option value="12">细致</option></select></label><label class="field"><span>还原内容</span><select id="recon-content"><option value="people-scene">人物＋场景</option><option value="people">仅人物</option></select></label><label id="recon-scene-field" class="field"><span>场景</span><select id="recon-scene"><option value="planes">简化平面</option><option value="mesh">环境网格</option></select></label><label class="field"><span>人物模型</span><select id="recon-actor-model">${options([['source','识别模型'],...HUMAN_ASSETS.map(a=>[a.id,a.name] as [string,string])],'source')}</select></label></div></details><section id="recon-people" class="reconstruction-people" hidden></section><section id="recon-setup" hidden><p>首次使用需要下载模型</p><button id="recon-prepare">准备模型</button></section><section id="recon-install-progress" class="reconstruction-install-progress" hidden></section><p id="recon-error" role="alert"></p></div><div class="reconstruction-primary-actions"><button id="recon-cancel" hidden>取消任务</button><button id="recon-open" class="primary" hidden>打开工程</button><button id="recon-run" class="primary">开始转换</button></div>`]];
    const nodes:HTMLElement[]=[];
    for(const [selector,className,html] of mounts){const node=document.createElement('section');node.className=className+' reconstruction-zone';node.innerHTML=html;document.querySelector(selector)!.append(node);nodes.push(node);}
    app.classList.add('reconstructing');
    const el=<T extends HTMLElement=HTMLButtonElement>(id:string)=>app.querySelector<T>('#recon-'+id)!;
    const player=el<HTMLVideoElement>('video-player');
    const selectedScene=()=>state.engine==='mediapipe'||el<HTMLSelectElement>('content').value==='people'?'none':el<HTMLSelectElement>('scene').value;
    const showContent=()=>{const lite=el<HTMLSelectElement>('engine').value==='mediapipe';el('scene-field').hidden=lite||el<HTMLSelectElement>('content').value==='people';el('content').closest('label')!.hidden=lite;el('people-count-field').hidden=!lite;const source=el<HTMLSelectElement>('actor-model').querySelector<HTMLOptionElement>('option[value=source]')!;source.hidden=lite;source.disabled=lite;if(lite&&el<HTMLSelectElement>('actor-model').value==='source')el<HTMLSelectElement>('actor-model').value='human-adult';};
    const restoreScene=(scene:string)=>{el<HTMLSelectElement>('content').value=scene==='none'?'people':'people-scene';el<HTMLSelectElement>('scene').value=scene==='mesh'?'mesh':'planes';showContent();};
    el<HTMLSelectElement>('content').onchange=showContent;
    let selectToEnd=false;
    let resultUI:ReturnType<typeof createReconstructionResultUI>|undefined,resultJob='';
    function clearResult(){resultUI?.dispose();resultUI=undefined;resultJob='';el('options').removeAttribute('data-result');(el('options') as HTMLDetailsElement).open=true;el('interval').hidden=false;el('result-title').textContent=t('识别预览');}
    el<HTMLDetailsElement>('options').ontoggle=()=>{if(active)el('interval').hidden=!!resultUI&&!el<HTMLDetailsElement>('options').open;};
    const range=createVideoRange(el('interval'),(_start,_end,seek)=>{resultUI?.pause();selectToEnd=false;if(Number.isFinite(player.duration))player.currentTime=Math.min(seek,Math.max(0,player.duration-.001));view='source';showView();});
    const updateRangeMinimum=()=>range.setMinimum(minimumAnalysisDuration(Number(el<HTMLSelectElement>('fps').value)));
    el<HTMLSelectElement>('fps').onchange=updateRangeMinimum;
    let previewFrames:{sequence:number,time:number}[]=[],reviewFrame:number|undefined,reviewGeneration=0;
    const clipLength=()=>range.value.end-range.value.start;
    let active=true,polling=false,working=false,state=initial,view='split',hasFrame=false,videoURL='',fileGeneration=0;
    let preview:ReturnType<typeof createReconstructionPreview>|undefined,previewJob='',sequence=-1,previewPolling=false,seenJob=initial.job?.id;
    function close(){
        if(!active)return;active=false;fileGeneration++;clearInterval(timer);clearResult();preview?.dispose();player.pause();player.removeAttribute('src');player.load();
        drafts.set(ctx,{path:el<HTMLInputElement>('video').value,start:el<HTMLInputElement>('start').value,seconds:String(clipLength()),fps:el<HTMLSelectElement>('fps').value,scene:selectedScene(),actorModel:el<HTMLSelectElement>('actor-model').value});
        nodes.forEach(node=>node.remove());app.classList.remove('reconstructing');workspaces.delete(ctx);void reconstruction('release-video').catch(()=>{});
        document.querySelector<HTMLButtonElement>('[data-act="video-reconstruction"]')?.focus();ctx.engine.render();
    }
    workspaces.set(ctx,{close});
    function showView(){
        app.querySelector<HTMLElement>('.reconstruction-viewports')!.dataset.view=view;
        for(const button of app.querySelectorAll<HTMLElement>('[data-recon-view]'))button.setAttribute('aria-pressed',String(button.dataset.reconView===view));
        const frames=!resultUI?.ready&&hasFrame&&view!=='source';el('source-frame').hidden=!frames;player.hidden=frames||!videoURL;
        el('source-empty').hidden=!!videoURL||frames;
        if(frames||view==='result')player.pause();
    }
    async function selectFile(file:string,preserveRange=false){
        if(!preserveRange){selectToEnd=false;range.set(0,10,10);}
        const generation=++fileGeneration;clearResult();el<HTMLInputElement>('video').value=file;el('filename').textContent=file.split(/[\\/]/).pop()||file;el('file').title=file;el('file').hidden=!file;
        hasFrame=false;sequence=-1;previewJob='';previewFrames=[];reviewFrame=undefined;reviewGeneration++;el('review').hidden=true;preview?.dispose();preview=undefined;el('result-empty').hidden=false;el('result-empty').textContent=t('等待转换');el('follow').hidden=true;el('frame').textContent='';videoURL='';player.pause();player.removeAttribute('src');player.load();showView();paint(state);
        if(!file)return;
        try{const source=await reconstruction('source-video',{path:file});if(!active||generation!==fileGeneration)return;videoURL=source.url;player.src=source.url;showView();paint(state);}
        catch(e){if(active&&generation===fileGeneration)el('error').textContent=(e as Error).message;}
    }
    player.addEventListener('loadedmetadata',()=>{if(!active||!Number.isFinite(player.duration))return;const value=range.value;range.set(value.start,selectToEnd?player.duration:value.end,player.duration);range.enable(!working&&state.job?.status!=='running');player.currentTime=range.value.start;});
    player.addEventListener('error',()=>{if(active&&videoURL)el('error').textContent=t('此视频无法预览，仍可转换');});
    async function previewFrame(){
        if(resultUI||previewPolling||!active||state.job?.kind!=='convert'||state.job.input?.path!==el<HTMLInputElement>('video').value)return;previewPolling=true;
        const requested=reviewFrame,generation=reviewGeneration;
        try{const frame=await reconstruction('preview',{jobId:previewJob,sequence,...(requested===undefined?{}:{frame:requested})});if(generation!==reviewGeneration)return;if(resultUI||!active||!frame||frame.jobId!==state.job?.id||state.job.input?.path!==el<HTMLInputElement>('video').value)return;
            if(previewJob!==frame.jobId){preview?.dispose();preview=undefined;}
            previewJob=frame.jobId;sequence=frame.sequence;hasFrame=true;
            previewFrames=frame.frames||[];el('review').hidden=previewFrames.length<2;
            const slider=el<HTMLInputElement>('review-frame');slider.max=String(Math.max(0,previewFrames.length-1));slider.value=String(requested===undefined?previewFrames.length-1:Math.max(0,previewFrames.findIndex(f=>f.sequence===requested)));
            if(frame.source)el<HTMLImageElement>('source-frame').src=frame.source;
            el('frame').textContent=`${Number(frame.time).toFixed(1)} s · ${frame.frameIndex+1} / ${frame.frameCount}`;
            if(frame.camera){
                preview??=createReconstructionPreview(el('space'));preview.update(frame);
                const visible=(frame.points?.length||0)>0||(frame.actors?.some((actor:any)=>actor.joints?.length>1)??false);
                el('result-empty').hidden=visible;el('result-empty').textContent=t(state.job?.input?.scene==='none'?'此帧未识别到人物':'此帧未识别到人物或场景');el('follow').hidden=!visible;
            }else{el('result-empty').textContent=t('正在分析');el('result-empty').hidden=false;}
            showView();
        }catch(e){if(active)el('error').textContent=(e as Error).message;}finally{previewPolling=false;if(active&&generation!==reviewGeneration)queueMicrotask(()=>void previewFrame());}
    }
    function showResult(){
        const job=state.job;
        if(job?.status!=='completed'||!job.file||job.input?.path!==el<HTMLInputElement>('video').value||resultJob===job.id)return;
        clearResult();resultJob=job.id;reviewGeneration++;preview?.dispose();preview=undefined;
        el('review').hidden=true;el('follow').hidden=true;el('result-empty').hidden=true;
        el('result-title').textContent=t('结果预览');
        const settings=el<HTMLDetailsElement>('options');settings.open=true;settings.dataset.result='true';el('interval').hidden=false;el('open').disabled=true;
        let stored=resultChoices.get(ctx);if(!stored||stored.jobId!==job.id){stored={jobId:job.id,choices:new Map()};resultChoices.set(ctx,stored);}
        resultUI=createReconstructionResultUI({people:el('people'),transport:el('result-transport'),space:el('space'),player,
            error:message=>{if(active)el('error').textContent=message;},changed:()=>{if(active){showView();paint(state);}}},job.file,job.input.start,stored.choices);
    }
    function paint(next:any){
        state=next;if(!active)return;el<HTMLSelectElement>('engine').value=state.engine??'mediapipe';paintReconstructionModes(el<HTMLSelectElement>('engine'),state.modes);showContent();const job=state.job,busy=job?.status==='running';
        if(job?.id!==seenJob){seenJob=job?.id;if(job?.kind==='convert'){
            restoreScene(job.input.scene);el<HTMLSelectElement>('actor-model').value=job.input.actorModel??'source';
            el<HTMLSelectElement>('fps').value=String(job.input.fps);updateRangeMinimum();selectToEnd=job.input.seconds===0;
            const end=job.input.start+(job.input.seconds||10);range.set(job.input.start,end,Math.max(end,10));
            void selectFile(job.input.path,true);
        }}
        paintInstallProgress(el('install-progress'),job?.engine&&job.engine!==state.engine?null:job);
        el('setup').hidden=state.accepted&&state.ready||busy;el('prepare').disabled=working||!state.supported;
        el('run').disabled=working||busy||!state.supported||(state.ready&&state.accepted&&!el<HTMLInputElement>('video').value);
        el('cancel').hidden=!busy;el('cancel').disabled=working||!!job?.cancelled;
        el('open').hidden=job?.status!=='completed'||!job.file||job.input?.path!==el<HTMLInputElement>('video').value;el('open').disabled=working||!!resultUI&&!resultUI.ready;
        el('run').classList.toggle('primary',el('open').hidden);
        el('run').textContent=t(el('open').hidden?'开始转换':'重新转换');
        range.enable(!working&&!busy&&Number.isFinite(player.duration)&&!!videoURL);
        for(const id of ['choose','empty-choose','fps','scene','content','actor-model','engine','people-count'])el<HTMLInputElement>(id).disabled=working||busy;
        el('message').textContent=!state.supported?t('此功能需要 Windows / Linux x64'):job?.kind==='convert'&&job.input?.path!==el<HTMLInputElement>('video').value?'':job?.message||'';
        el<HTMLProgressElement>('progress').hidden=!busy;el<HTMLProgressElement>('progress').value=job?.progress||0;
        showResult();
        resultUI?.setBusy(working);el('back').disabled=working;
        if(busy&&job.totalBytes)el('message').textContent+=`　${Math.round(job.downloadedBytes/1024**2)} / ${Math.round(job.totalBytes/1024**2)} MB`;
    }
    async function action(fn:()=>Promise<unknown>){if(working)return;working=true;el('error').textContent='';paint(state);try{await fn();if(active)paint(await reconstruction('state'));}catch(e){if(active)el('error').textContent=(e as Error).message;}finally{working=false;if(active)paint(state);}}
    el('engine').onchange=()=>{const engine=el<HTMLSelectElement>('engine').value;void action(async()=>{await reconstruction('configure',{engine});});};
    el('back').onclick=close;
    for(const button of app.querySelectorAll<HTMLButtonElement>('[data-recon-view]'))button.onclick=()=>{view=button.dataset.reconView!;showView();};
    el('configure').onclick=()=>void openReconstructionSettings(ctx).catch(e=>ctx.toast(e.message,true));el('prepare').onclick=el('configure').onclick;
    el('choose').onclick=()=>void action(async()=>{const source=await reconstruction('choose-video');if(source.path)await selectFile(source.path);});el('empty-choose').onclick=el('choose').onclick;
    el<HTMLInputElement>('review-frame').oninput=()=>{reviewFrame=previewFrames[Number(el<HTMLInputElement>('review-frame').value)]?.sequence;reviewGeneration++;sequence=-1;view='split';showView();void previewFrame();};
    el('live').onclick=()=>{reviewFrame=undefined;reviewGeneration++;sequence=-1;void previewFrame();};
    el('follow').onclick=()=>{preview?.follow();sequence=-1;void previewFrame();};
    el('run').onclick=()=>void action(async()=>{
        if(!state.ready||!state.accepted){await openReconstructionSettings(ctx);return;}
        assertAnalysisDuration(clipLength(),Number(el<HTMLSelectElement>('fps').value));
        clearResult();
        view='split';showView();
        await reconstruction('start',{path:el<HTMLInputElement>('video').value,start:range.value.start,seconds:clipLength(),fps:Number(el<HTMLSelectElement>('fps').value),scene:selectedScene(),actorModel:el<HTMLSelectElement>('actor-model').value,...(state.engine==='mediapipe'?{people:Number(el<HTMLInputElement>('people-count').value)}:{}),requestId:crypto.randomUUID()});
    });
    el('cancel').onclick=()=>void action(()=>reconstruction('cancel'));
    async function openResult(){
        resultUI?.pause();
        const operations=resultUI?.operations()??[],selected=resultUI?.selected,time=resultUI?.time??0;
        const result=await reconstruction('result'),tools=createToolService(ctx),read=await tools.call('director_read',{sections:[]});if(!read.ok)throw Error(read.error);
        const opened=await tools.call('director_import',{kind:'project',mode:'open',path:result.path,revision:read.data.revision,requestId:crypto.randomUUID()});if(!opened.ok)throw Error(opened.error);
        if(opened.data?.jobId)for(;;){const job=await tools.call('director_job',{id:opened.data.jobId});if(!job.ok)throw Error(job.error);if(job.data.status==='completed')break;if(job.data.status!=='running')throw Error(job.data.error||'打开工程失败');await new Promise(r=>setTimeout(r,150));}
        if(operations.length){
            const current=await tools.call('director_read',{sections:[]});if(!current.ok)throw Error(current.error);
            const applied=await tools.call('director_apply',{revision:current.data.revision,requestId:crypto.randomUUID(),operations});if(!applied.ok)throw Error(applied.error);
        }
        ctx.closeModal();close();
        if(selected){ctx.inspectorTab='actions';ctx.selectEntity(selected);ctx.seek(time);}
    }
    el('open').onclick=()=>{
        if(!ctx.dirty){void action(openResult);return;}
        if (!ctx.showModal('打开工程','<p>当前工程有未保存更改</p>','<button data-act="close-modal" id="recon-keep">取消</button><button id="recon-discard">直接打开</button><button id="recon-save-open" class="primary">保存并打开</button>')) return;
        document.querySelector<HTMLButtonElement>('#recon-discard')!.onclick=()=>void action(openResult);
        document.querySelector<HTMLButtonElement>('#recon-save-open')!.onclick=()=>void action(async()=>{if(await ctx.saveProject())await openResult();});
    };
    const draft=drafts.get(ctx)||initial.job?.input;
    if(draft){selectToEnd=Number(draft.seconds)===0;const start=Number(draft.start)||0,end=start+(Number(draft.seconds)||10);range.set(start,end,Math.max(end,10));}
    if(draft?.scene)restoreScene(draft.scene);
    el<HTMLSelectElement>('actor-model').value=draft?.actorModel??'source';
    if(draft)for(const id of ['fps'])if(draft[id as keyof typeof draft]!==undefined)el<HTMLInputElement>(id).value=String(draft[id as keyof typeof draft]);
    updateRangeMinimum();
    const timer=setInterval(()=>{if(!active||polling||working)return;polling=true;void reconstruction('state').then(next=>{paint(next);void previewFrame();}).catch(e=>{if(active)el('error').textContent=e.message;}).finally(()=>polling=false);},750);
    paint(initial);if(draft?.path)await selectFile(draft.path,true);void previewFrame();el('choose').focus();
}
