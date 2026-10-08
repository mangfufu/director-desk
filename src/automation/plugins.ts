import type {AppContext} from '../app-context.ts';
import type {ExtensionInfo,ExtensionSummary} from '../plugins/extension-package.ts';
import {extensionDesktop,extensionHost} from '../plugins/extension-host.ts';
export async function pluginAction(ctx:AppContext,args:Record<string,unknown>,call:(name:string,args:Record<string,unknown>)=>Promise<unknown>){
    const host=extensionHost(ctx,call),id=String(args.id??'');
    if(args.action==='list')return {items:(await extensionDesktop({action:'list'}) as ExtensionInfo[]).map((item):ExtensionSummary=>({
        id:item.id,name:item.name,version:item.version,description:item.description,permissions:item.permissions,enabled:item.enabled,
        commands:item.commands.map(({id,label,description})=>({id,label,description})),
        error:host.errors.get(item.id),active:host.active.has(item.id),
    }))};
    if(args.action==='read')return {...await extensionDesktop({action:'read',id}),error:host.errors.get(id),active:host.active.has(id)};
    if(args.action==='import')return host.install(String(args.path??''));
    if(args.action==='enable')return host.enable(id,args.enabled as boolean);
    if(args.action==='remove'){await host.remove(id);return {removed:true};}
    if(args.action==='run'){const result=await host.run(id,String(args.command??''),args.input);return result===undefined?null:JSON.parse(JSON.stringify(result));}
    throw Error('未知插件操作');
}
