import type {AppContext} from '../app-context.ts';
import type {ExtensionSummary} from '../plugins/extension-package.ts';
import {extensionDesktop} from '../plugins/extension-host.ts';
import {extensionCall} from './extension-tools.ts';
import {$,button,escape,options} from './common.ts';
import './extensions.css';
export function createPluginsPanel(ctx:AppContext){
    let items:ExtensionSummary[]=[],current='',command='',busy=false;
    async function render(open=false){
        if(!window.directorDesktop?.extensions){ctx.toast('扩展插件需要桌面版');return;}
        items=(await extensionCall(ctx,'director_plugins',{action:'list'})).items;
        if(!open&&!document.querySelector('.plugins-panel'))return;
        if(!items.some(p=>p.id===current))current=items[0]?.id??'';const item=items.find(p=>p.id===current);
        if(!item?.commands.some(c=>c.id===command))command=item?.commands[0]?.id??'';const cmd=item?.commands.find(c=>c.id===command);
        ctx.showModal('插件',`<div class="extension-panel plugins-panel"><div class="extension-actions">${button('plugins-import','导入插件')}${button('plugins-folder','导入目录')}</div>${items.length?`<label class="field"><span>已安装插件</span><select id="plugin-choice">${options(items.map(p=>[p.id,`${p.name} · ${p.version}`]),current)}</select></label>`:'<p>还没有插件</p>'}${item?`<p>${escape(item.description??'')}</p><details class="plugin-permissions"><summary>权限</summary><p>${item.permissions.includes('native')?'编辑工程、访问本机文件和网络、运行程序':item.permissions.includes('network')?'编辑工程、访问网络':'编辑工程'}</p></details><div class="plugin-enable-row"><div class="plugin-enable-control"><span id="plugin-enable-label">启用插件</span><button type="button" class="plugin-enable-switch" data-act="plugins-toggle" role="switch" aria-labelledby="plugin-enable-label" aria-checked="${item.enabled}"><span aria-hidden="true"></span></button></div>${button('plugins-remove','卸载','','subtle')}</div>${item.error?`<p role="alert">${escape(item.error)}</p>`:''}${item.commands.length?`<label class="field"><span>插件入口</span><select id="plugin-command">${options(item.commands.map(c=>[c.id,c.label]),command)}</select></label>${cmd?.description?`<p>${escape(cmd.description)}</p>`:''}<details><summary>命令参数</summary><textarea id="plugin-input" aria-label="命令参数 JSON" rows="3">{}</textarea></details>`:''}<textarea id="plugin-result" aria-label="运行结果" readonly hidden rows="3"></textarea>`:''}</div>`,(cmd?button('plugins-run',cmd.label,'','primary',item?.enabled?'':'disabled'):'')+button('close-modal','关闭','','subtle'));
        document.querySelector('#plugin-choice')?.addEventListener('change',()=>{if(busy)return;current=$('#plugin-choice').value;command='';void render().catch(e=>ctx.toast(e.message,true));});
        document.querySelector('#plugin-command')?.addEventListener('change',()=>{if(busy)return;command=$('#plugin-command').value;void render().catch(e=>ctx.toast(e.message,true));});
    }
    return {handle(action:string,el:HTMLElement){
        if(!action.startsWith('plugins-'))return false;if(busy)return true;busy=true;
        void(async()=>{
            if(action==='plugins-open'){await render(true);return;}
            if(action==='plugins-import'||action==='plugins-folder'){
                const result=await extensionDesktop({action:'choose',directory:action==='plugins-folder'});if(!result)return;
                const installed=await extensionCall(ctx,'director_plugins',{action:'import',path:result.path},true);current=installed.id;command='';await render();return;
            }
            if(action==='plugins-toggle'){
                const item=items.find(p=>p.id===current)!,enabled=!item.enabled;el.setAttribute('disabled','');
                try{await extensionCall(ctx,'director_plugins',{action:'enable',id:current,enabled},true);item.enabled=enabled;el.setAttribute('aria-checked',String(enabled));const run=document.querySelector<HTMLButtonElement>('[data-act="plugins-run"]');if(run)run.disabled=!enabled;}finally{el.removeAttribute('disabled');}return;
            }
            if(action==='plugins-remove'){await extensionCall(ctx,'director_plugins',{action:'remove',id:current},true);await render();return;}
            if(action==='plugins-run'){
                const input=JSON.parse($('#plugin-input')?.value||'{}');el.setAttribute('disabled','');
                try{const result=await extensionCall(ctx,'director_plugins',{action:'run',id:current,command,input},true);const out=document.querySelector<HTMLTextAreaElement>('#plugin-result');if(out&&result!==null){out.hidden=false;out.value=typeof result==='string'?result:JSON.stringify(result,null,2);}else ctx.closeModal();}
                finally{el.removeAttribute('disabled');}
            }
        })().catch(e=>ctx.toast(e.message,true)).finally(()=>busy=false);return true;
    }};
}
