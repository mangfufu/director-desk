import * as THREE from 'three';
import type {AppContext} from '../app-context.ts';
import {clone} from '../model.ts';
import type {ExtensionInfo} from './extension-package.ts';
import type {PluginFrame,PluginRender} from './render-hooks.ts';
import {assertExtensionData} from './project-data.ts';
import {extensionPanel} from './extension-panels.ts';
type Call=(name:string,args:Record<string,unknown>)=>Promise<unknown>;
type Handler=(input:any)=>unknown;
interface Active {info:ExtensionInfo;commands:Map<string,Handler>;services:Map<string,unknown>;cleanup:(()=>unknown)[];stopped:boolean}
const hosts=new WeakMap<AppContext,ExtensionHost>();
export async function extensionDesktop(args:Record<string,unknown>):Promise<any>{
    if(!window.directorDesktop?.extensions)throw Error('扩展插件需要桌面版');
    const r=await window.directorDesktop.extensions(args);if(!r.ok)throw Error(r.error);return r.data;
}
export function extensionHost(ctx:AppContext,call?:Call){let host=hosts.get(ctx);if(!host){if(!call)throw Error('插件运行环境尚未就绪');host=new ExtensionHost(ctx,call);hosts.set(ctx,host);}return host;}
class ExtensionHost {
    active=new Map<string,Active>();loading=new Map<string,Promise<void>>();errors=new Map<string,string>();
    private observers=new Set<()=>void>();
    poll(){for(const notify of this.observers)notify();}
    private ctx:AppContext;private call:Call;
    constructor(ctx:AppContext,call:Call){
        this.ctx=ctx;this.call=call;
        if(typeof window==='undefined')return;
        window.directorDesktop?.onExtensionRequest?.(async request=>{
            const item=this.active.get(request.plugin);if(!item||item.stopped)throw Error('插件已停用');
            if(request.method==='tool')return call(request.args.name,request.args.args??{});
            if(request.method==='command')return this.run(request.plugin,request.args.command,request.args.input);
            throw Error('未知编辑器接口');
        });
    }
    async start(){if(!window.directorDesktop?.extensions)return;const items:ExtensionInfo[]=await extensionDesktop({action:'list'});for(const item of items)if(item.enabled)try{await this.activate(item);}catch(error){this.ctx.toast(`${item.name}：${(error as Error).message}`,true);}}
    async activate(info:ExtensionInfo){
        if(this.loading.has(info.id))return this.loading.get(info.id);if(this.active.has(info.id))return;
        const task=this.load(info);this.loading.set(info.id,task);try{await task;}finally{this.loading.delete(info.id);}
    }
    private async load(info:ExtensionInfo){
        const ctx=this.ctx,item:Active={info,commands:new Map(),services:new Map(),cleanup:[],stopped:false};this.active.set(info.id,item);this.errors.delete(info.id);
        const live=()=>{if(item.stopped)throw Error('插件已停用');};
        const own=(cleanup:()=>unknown)=>{if(item.stopped){void cleanup();throw Error('插件已停用');}item.cleanup.push(cleanup);return cleanup;};
        const failed=(error:unknown)=>{const message=error instanceof Error?error.message:String(error);this.errors.set(info.id,message);ctx.toast(`${info.name}：${message}`,true);};
        const sample=(fn:(frame:PluginFrame)=>unknown)=>{
            let failure:unknown;const wrapped=(frame:PluginFrame)=>{if(failure){if(frame.exporting)throw failure;return;}try{const r=fn(frame);if(r&&typeof (r as any).then==='function')throw Error('逐帧回调必须同步');}catch(error){failure=error;failed(error);if(frame.exporting)throw error;}};
            ctx.engine.pluginHooks.samples.add(wrapped);return own(()=>ctx.engine.pluginHooks.samples.delete(wrapped));
        };
        const api={
            version:2,id:info.id,THREE,
            tools:{call:(name:string,args:Record<string,unknown>={})=>{live();return this.call(name,args);}},
            commands:{register:(id:string,handler:Handler)=>{live();if(!info.commands.some(c=>c.id===id)||item.commands.has(id)||typeof handler!=='function')throw Error('命令未声明或重复');item.commands.set(id,handler);return own(()=>item.commands.delete(id));}},
            services:{provide:(name:string,value:unknown)=>{live();if(item.services.has(name))throw Error('服务已注册');item.services.set(name,value);return own(()=>item.services.delete(name));},get:(plugin:string,name:string)=>{live();return this.active.get(plugin)?.services.get(name);}},
            extensions:{run:(id:string,command:string,input:unknown={})=>{live();return this.run(id,command,input);}},
            project:{get:()=>{live();return clone(ctx.project.extensions?.[info.id]??null);},set:(value:unknown)=>{live();if(ctx.busy||ctx.draft||ctx.history.pending||ctx.engine.exporting)throw Error('请先结束当前编辑');assertExtensionData({[info.id]:value});if(!ctx.change(()=>{ctx.project.extensions={...ctx.project.extensions,[info.id]:clone(value)};},false))throw Error('插件数据未提交');ctx.engine.sample(ctx.time);ctx.engine.render();},read:()=>{live();return clone(ctx.project);}},
            editor:{transaction:(mutate:(project:typeof ctx.project)=>unknown)=>{
                live();if(ctx.busy||ctx.draft||ctx.history.pending||ctx.engine.exporting)throw Error('请先结束当前编辑');
                const draft=clone(ctx.project),result=mutate(draft);
                if(result&&typeof (result as any).then==='function'){void Promise.resolve(result).catch(()=>{});throw Error('编辑事务必须同步');}
                return ctx.change(()=>{
                    for(const key of Object.keys(ctx.project))delete (ctx.project as unknown as Record<string,unknown>)[key];
                    Object.assign(ctx.project,clone(draft));
                });
            },selection:()=>ctx.selected,time:()=>ctx.time,seek:(t:number)=>{live();ctx.seek(t);},invalidate:()=>{live();ctx.engine.sample(ctx.time);ctx.engine.render();},toast:(message:string)=>ctx.toast(message)},
            ui:{panel:(options:{title:string;mount:(root:ShadowRoot)=>void|(()=>void)})=>{live();const panel=extensionPanel(options.title,options.mount,failed);own(panel.dispose);return panel;},commandButton:(id:string)=>{live();const cmd=info.commands.find(c=>c.id===id);if(!cmd)throw Error('命令不存在');const el=document.createElement('button');el.textContent=cmd.label;el.className='subtle';el.onclick=()=>{void this.run(info.id,id,{}).catch(failed);};document.querySelector('.key-tools')?.append(el);own(()=>el.remove());return el;}},
            events:{on:(name:'project'|'selection',fn:Handler)=>{
                live();if(!['project','selection'].includes(name))throw Error('未知插件事件');let previous:unknown=Symbol();
                const notify=()=>{const current=name==='selection'?ctx.selected:ctx.revision;if(current===previous)return;previous=current;
                    try{void Promise.resolve(fn(name==='selection'?current:clone(ctx.project))).catch(failed);}catch(error){failed(error);}
                };
                this.observers.add(notify);return own(()=>this.observers.delete(notify));
            }},
            render:{onSample:sample,attach:(object:THREE.Object3D)=>{live();ctx.engine.scene.add(object);return own(()=>object.removeFromParent());},use:(pass:(frame:PluginRender,next:()=>void)=>void)=>{live();let failure:unknown;const wrapped=(frame:PluginRender,next:()=>void)=>{if(failure){if(frame.exporting)throw failure;next();return;}try{pass(frame,next);}catch(error){failure=error;failed(error);if(frame.exporting)throw error;next();}};ctx.engine.pluginHooks.passes.add(wrapped);return own(()=>ctx.engine.pluginHooks.passes.delete(wrapped));}},
            backend:{call:(method:string,input:unknown={})=>{live();return extensionDesktop({action:'backend',id:info.id,method,input});}},
            net:{fetch:(url:string,options:Record<string,unknown>={})=>{live();return extensionDesktop({action:'fetch',id:info.id,url,options});}},
            assets:{url:(relative:string)=>new URL(relative,info.entryUrl).href},
            dispose:own,
            // Deliberately explicit: full-trust plugins can build capabilities beyond the stable SDK.
            experimental:{context:ctx,engine:ctx.engine},
        };
        let timer:ReturnType<typeof setTimeout>|undefined;
        try{
            const mod=await import(/* @vite-ignore */ info.entryUrl);if(typeof mod.activate!=='function')throw Error('插件需要导出 activate(api)');
            const activation=Promise.resolve(mod.activate(api)).then(dispose=>{if(typeof dispose==='function')own(dispose);else if(dispose?.dispose)own(()=>dispose.dispose());});
            await Promise.race([activation,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('插件初始化超时')),30000);})]);
            live();ctx.engine.sample(ctx.time);ctx.engine.render();
        }catch(error){if(this.active.get(info.id)===item)await this.stop(info.id);failed(error);throw error;}
        finally{clearTimeout(timer);}
    }
    async stop(id:string){const item=this.active.get(id);if(!item)return;item.stopped=true;this.active.delete(id);for(const cleanup of item.cleanup.reverse())try{await cleanup();}catch{}await extensionDesktop({action:'stop',id}).catch(()=>{});this.ctx.engine.render();}
    async run(id:string,command:string,input:unknown){const info:ExtensionInfo=await extensionDesktop({action:'read',id});if(!info.enabled)throw Error('插件尚未启用');await this.activate(info);const handler=this.active.get(id)?.commands.get(command);if(!handler)throw Error('插件未注册该命令');return handler(input===undefined?{}:input);}
    async enable(id:string,enabled:boolean){await this.stop(id);const info:ExtensionInfo=await extensionDesktop({action:'enable',id,enabled});if(enabled)try{await this.activate(info);}catch(error){await extensionDesktop({action:'enable',id,enabled:false});throw error;}return info;}
    async remove(id:string){await this.stop(id);await extensionDesktop({action:'remove',id});}
    async install(path:string){const info:ExtensionInfo=await extensionDesktop({action:'import',path});await this.stop(info.id);return info;}
}
