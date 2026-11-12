import type {AppContext} from '../app-context.ts';
import {sameProjectData} from '../resources/package-validation.ts';
import {clone} from '../model.ts';
import {blenderCall,importBlender} from '../import/blender-import.ts';
import {t} from '../i18n/locale.ts';
import {escape} from './common.ts';

export async function openBlenderImport(ctx:AppContext) {
    if(!window.directorDesktop?.blender){ctx.toast('请在桌面版中导入 Blender 工程');return;}
    if(!ctx.showModal('导入 Blender 工程',`<div class="field"><span>Blender</span><div class="resource-row"><input id="blend-program" aria-label="Blender" readonly/><button id="blend-choose-program">选择</button></div></div>
        <div class="field"><span>工程文件</span><div class="resource-row"><input id="blend-source" aria-label="工程文件" readonly/><button id="blend-choose-source">选择文件</button></div></div>
        <label class="field"><span>导入方式</span><select id="blend-mode"><option value="scene">新建独立戏段</option><option value="merge">加入当前戏段</option><option value="open">作为独立工程打开</option></select></label><label class="check"><input id="blend-animation" type="checkbox" checked/>导入动画</label>
        <progress id="blend-progress" max="1" value="0" hidden style="width:100%"></progress><p id="blend-status" role="status"></p><p id="blend-error" role="alert"></p><ul id="blend-warnings"></ul>`,
        '<button id="blend-cancel">取消</button><button id="blend-run" class="primary" disabled>导入</button>'))return;
    const modal=document.querySelector<HTMLElement>('.modal')!,el=<T extends HTMLElement=HTMLElement>(id:string)=>modal.querySelector<T>('#blend-'+id)!;
    let source='',ready=false,controller:AbortController|null=null,finished=false;
    const refresh=()=>{el<HTMLButtonElement>('run').disabled=!source||!ready||!!controller||finished;};
    const fail=(error:unknown)=>{el('error').textContent=error instanceof Error?error.message:String(error);};
    const display=(state:any)=>{ready=!!state.blender?.path;el<HTMLInputElement>('program').value=state.blender?.path||'';el<HTMLInputElement>('program').title=state.blender?.version||'';el('status').textContent=ready?'':t('未找到 Blender，请选择安装位置。');refresh();};
    el('choose-program').onclick=async()=>{try{el('error').textContent='';const result=await blenderCall('choose-blender');if(result.blender)display(result);}catch(e){fail(e);}};
    el('choose-source').onclick=async()=>{try{const result=await blenderCall('choose-file');if(result.path){source=result.path;el<HTMLInputElement>('source').value=source;refresh();}}catch(e){fail(e);}};
    const cancel=()=>{if(controller){controller.abort();el('status').textContent=t('正在取消…');el<HTMLButtonElement>('cancel').disabled=true;}else ctx.closeModal();};
    el('cancel').onclick=cancel;
    modal.querySelector('[data-act="close-modal"]')?.addEventListener('click',event=>{if(controller){event.preventDefault();event.stopImmediatePropagation();cancel();}},true);
    el('run').onclick=async()=>{
        if(controller||!ready||!source||ctx.busy)return;
        const original=ctx.project,snapshot=clone(original),aborter=controller=new AbortController();
        ctx.busy=true;ctx.playing=false;ctx.updateTimeUI();el('error').textContent='';el('warnings').replaceChildren();
        el<HTMLProgressElement>('progress').hidden=false;el('status').textContent=t('正在读取 Blender 工程…');
        for(const name of ['choose-program','choose-source','mode','animation']) (el(name) as HTMLInputElement).disabled=true;refresh();
        let polling=false;
        const stages:Record<string,string>={reading:'正在读取 Blender 工程…',materials:'正在转换材质…',models:'正在转换模型…',cameras:'正在转换摄影机…',lights:'正在转换灯光…',packing:'正在整理资源…'};
        const timer=setInterval(()=>{if(polling||aborter.signal.aborted)return;polling=true;void blenderCall('state').then(state=>{if(controller===aborter&&state.job?.status==='running')el('status').textContent=t(stages[state.job.stage]||'正在导入…');}).catch(()=>{}).finally(()=>polling=false);},500);
        try {
            const result=await importBlender(ctx,{path:source,mode:el<HTMLSelectElement>('mode').value as 'scene'|'open'|'merge',animations:el<HTMLInputElement>('animation').checked},aborter.signal,()=>{if(ctx.project!==original||!sameProjectData(ctx.project,snapshot))throw Error('导入期间工程已变化，请重新导入');},value=>{el<HTMLProgressElement>('progress').value=value;if(value>=.75)el('status').textContent=t('正在导入…');});
            finished=true;el('run').hidden=true;el('status').textContent=t('导入完成');el<HTMLProgressElement>('progress').value=1;
            el('warnings').innerHTML=result.warnings.map(w=>`<li>${escape(w)}</li>`).join('');
            ctx.engine.viewHome();

        }catch(error){if(aborter.signal.aborted)el('status').textContent=t('已取消');else{el('status').textContent='';fail(error);}}
        finally {clearInterval(timer);controller=null;ctx.busy=false;ctx.updateTimeUI();for(const name of ['choose-program','choose-source','mode','animation']) (el(name) as HTMLInputElement).disabled=finished;el<HTMLButtonElement>('cancel').disabled=false;el('cancel').textContent=t(finished?'完成':'取消');refresh();}
    };
    el('status').textContent=t('正在查找 Blender…');
    try{display(await blenderCall('state'));}catch(error){fail(error);}
}
