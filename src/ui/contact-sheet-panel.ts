import type { AppContext } from '../app-context.ts';
import { clone } from '../model.ts';
import { contactCardHtml, contactShots } from '../production/contact-sheet.ts';
import { contactSheetBlob, renderContactShots } from '../production/contact-render.ts';
import { safeFilename } from '../production/notes.ts';
import { openOutput } from '../files/desktop-output.ts';
import { download } from '../storage.ts';
import { escape } from './common.ts';
import './contact-sheet-panel.css';

export function openContactSheet(ctx:AppContext){
    if(ctx.busy||ctx.draft||ctx.history.pending)return;
    const project=clone(ctx.project),name=ctx.scenes.list().find(s=>s.id===ctx.scenes.context.sceneId)?.name??project.name;
    const shots=contactShots(project),pageSize=6;let page=0,controller:AbortController|undefined,active=true;
    ctx.playing=false;ctx.updateTimeUI();
    if (!ctx.showModal('镜头联系表',`<div class="contact-controls"><label>文件名<input id="contact-filename" value="${escape(safeFilename(project.name+'-'+name))}"/></label><span id="contact-status" role="status"></span></div><div id="contact-cards"></div>`,
        '<button id="contact-prev">上一页</button><span id="contact-page"></span><button id="contact-next">下一页</button><button id="contact-cancel" disabled>取消</button><button id="contact-export">导出 HTML</button>')) return;
    const modal=document.querySelector<HTMLElement>('.modal')!;modal.classList.add('contact-modal');
    const get=<T extends HTMLElement=HTMLButtonElement>(id:string)=>modal.querySelector<T>('#'+id)!;
    modal.addEventListener('director-before-close',()=>{active=false;controller?.abort();});
    function controls(working:boolean){
        get('contact-prev').disabled=working||page===0;get('contact-next').disabled=working||(page+1)*pageSize>=shots.length;
        get('contact-export').disabled=working;get('contact-cancel').disabled=!working;
        get('contact-page').textContent=`${page+1} / ${Math.max(1,Math.ceil(shots.length/pageSize))}`;
    }
    async function run(work:(signal:AbortSignal)=>Promise<void>){
        if(ctx.busy)return;controller=new AbortController();ctx.busy=true;ctx.updateTimeUI();controls(true);
        try{await work(controller.signal);if(active)get('contact-status').textContent='';}
        catch(error){if(active)get('contact-status').textContent=controller.signal.aborted?'已取消':(error as Error).message;}
        finally{controller=undefined;ctx.busy=false;ctx.updateTimeUI();if(active)controls(false);}
    }
    const render=()=>run(async signal=>{
        get('contact-cards').replaceChildren();get('contact-status').textContent='正在生成…';
        await renderContactShots(ctx.engine,project,shots.slice(page*pageSize,(page+1)*pageSize),signal,card=>{
            if(active)get('contact-cards').insertAdjacentHTML('beforeend',contactCardHtml(card,true));
        });
    });
    get('contact-prev').onclick=()=>{page--;void render();};get('contact-next').onclick=()=>{page++;void render();};
    get('contact-cancel').onclick=()=>controller?.abort();
    get('contact-export').onclick=()=>void run(async signal=>{
        const filename=safeFilename(get<HTMLInputElement>('contact-filename').value.trim()||project.name)+'.html';
        const blob=await contactSheetBlob(ctx.engine,project,name,signal,value=>{get('contact-status').textContent=`${Math.round(value*100)}%`;});
        if(window.directorDesktop?.files){const output=await openOutput({},filename,'contact-sheet');try{await output.blob(blob,signal);}finally{await output.abort();}}
        else {signal.throwIfAborted();download(blob,filename);}
        ctx.toast('联系表已导出');
    });
    void render();
}
