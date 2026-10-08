import type { AppContext } from '../app-context.ts';
import type { VersionInfo } from '../versions/store.ts';
import { extensionCall } from './extension-tools.ts';
import { $, button, escape } from './common.ts';
import './extensions.css';
export function createVersionsPanel(ctx: AppContext) {
    let current = '', page = 0, busy = false, owner = '';
    async function render(open = false) {
        const identity = ctx.scenes.projectId;
        const {items} = await extensionCall(ctx,'director_versions',{action:'list'}) as {items:VersionInfo[]};
        if (ctx.scenes.projectId !== identity || !open && !document.querySelector('.versions-panel')) return;
        if (owner !== identity) { current='';page=0;owner=identity; }
        page=Math.min(page,Math.max(0,Math.ceil(items.length/5)-1));
        const rows=items.slice(page*5,page*5+5);if(!rows.some(v=>v.id===current))current=rows[0]?.id??'';
        const selected=rows.find(v=>v.id===current);
        ctx.showModal('工程历史版本',`<div class="extension-panel versions-panel"><label class="field"><span>版本名称</span><input id="version-name" maxlength="200" value="${escape(selected?.name??'新版本')}"></label><div class="extension-actions">${button('versions-save','保存当前版本','','primary')}${selected?button('versions-rename','重命名')+button('versions-remove','删除'):''}</div><div class="extension-list">${rows.map(v=>button('versions-select',`<span>${escape(v.name)}</span><small>${escape(new Date(v.created).toLocaleString())} · ${v.scenes} 场</small>`,'',v.id===current?'active':'',`data-id="${escape(v.id)}"`)).join('')||'<p>还没有保存的版本</p>'}</div><div class="extension-actions">${button('versions-prev','上一页','','subtle',page?'':'disabled')}<span>${page+1} / ${Math.max(1,Math.ceil(items.length/5))}</span>${button('versions-next','下一页','','subtle',(page+1)*5<items.length?'':'disabled')}</div></div>`,(selected?button('versions-export','导出')+button('versions-restore','恢复此版本','','primary'):'')+button('close-modal','关闭','','subtle'));
    }
    return {handle(action:string,el:HTMLElement){
        if(!action.startsWith('versions-'))return false;if(busy)return true;busy=true;
        void(async()=>{
            if(action==='versions-open'){await render(true);return;}
            if(owner!==ctx.scenes.projectId)throw Error('工程已切换，请重新打开版本列表');
            if(action==='versions-select')current=el.dataset.id!;
            else if(action==='versions-prev')page=Math.max(0,page-1);
            else if(action==='versions-next')page++;
            else {
                const operation=action.slice('versions-'.length),name=$('#version-name').value;
                const data=await extensionCall(ctx,'director_versions',{action:operation,...(operation==='save'?{}:{id:current}),...(['save','rename'].includes(operation)?{name}:{})},true);
                if(operation==='save'){current=data.id;page=0;ctx.toast('版本已保存');}
                if(operation==='restore'){ctx.closeModal();ctx.toast('已恢复版本');return;}
                if(operation==='export')ctx.toast('版本已导出');
            }
            await render();
        })().catch(error=>ctx.toast(error.message,true)).finally(()=>{busy=false;});return true;
    }};
}
