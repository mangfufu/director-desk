const {ipcMain,dialog,app,utilityProcess}=require('electron');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {createExtensionStore}=require('./store.cjs');
function attachExtensions(window){
    const store=createExtensionStore(app.getPath('userData')),workers=new Map(),editorCalls=new Map();
    const trusted=e=>e.sender===window.webContents&&e.senderFrame?.url==='director://app/';
    const reply=(e,m)=>{if(!trusted(e))return;const p=editorCalls.get(m?.id);if(!p)return;editorCalls.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error)):p.resolve(m.result);};
    ipcMain.on('director-extension-reply',reply);
    function callEditor(plugin,method,args){return new Promise((resolve,reject)=>{const id=randomUUID(),timer=setTimeout(()=>{editorCalls.delete(id);reject(Error('插件编辑器请求超时'));},30000);editorCalls.set(id,{resolve,reject,timer,plugin});window.webContents.send('director-extension-request',{id,plugin,method,args});});}
    async function stop(id){const state=workers.get(id);if(!state)return;workers.delete(id);for(const task of state.pending.values()){clearTimeout(task.timer);task.reject(Error('插件后台已停止'));}state.pending.clear();state.child.postMessage({type:'stop'});setTimeout(()=>state.child.kill(),500).unref();for(const [key,p]of editorCalls)if(p.plugin===id){clearTimeout(p.timer);p.reject(Error('插件已停用'));editorCalls.delete(key);}}
    async function worker(id){
        if(workers.has(id))return workers.get(id).ready;
        const info=await store.info(id);if(!info.enabled||!info.backend||!info.permissions.includes('native'))throw Error('插件没有启用后台能力');
        if(workers.has(id))return workers.get(id).ready;
        const child=utilityProcess.fork(path.join(__dirname,'extension-worker.cjs'),[],{stdio:'ignore',serviceName:`Director extension: ${id}`});
        const state={child,pending:new Map()};workers.set(id,state);
        state.ready=new Promise((resolve,reject)=>{
            const timer=setTimeout(()=>{reject(Error('插件后台启动超时'));void stop(id);},30000);
            child.on('message',m=>{
                if(m.type==='ready'){clearTimeout(timer);resolve(state);}
                else if(m.type==='startup-error'){clearTimeout(timer);reject(Error(m.error));void stop(id);}
                else if(m.type==='result'){const p=state.pending.get(m.id);if(p){state.pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error)):p.resolve(m.result);}}
                else if(m.type==='editor')void callEditor(id,m.method,m.args).then(result=>{if(workers.get(id)===state)child.postMessage({type:'reply',id:m.id,result});},error=>{if(workers.get(id)===state)child.postMessage({type:'reply',id:m.id,error:error.message});});
            });
            child.on('exit',()=>{clearTimeout(timer);reject(Error('插件后台已退出'));if(workers.get(id)===state)workers.delete(id);for(const p of state.pending.values()){clearTimeout(p.timer);p.reject(Error('插件后台已退出'));}});
        });
        state.ready.catch(()=>{});
        child.postMessage({type:'start',pluginId:id,entry:path.join(store.home(id),info.digest,info.backend),dataDirectory:await store.dataDirectory(id)});
        return state.ready;
    }
    async function action(args){
        if(args.action==='list')return store.list();
        if(args.action==='read')return store.info(args.id);
        if(args.action==='choose'){
            const result=await dialog.showOpenDialog(window,{title:'导入插件',properties:[args.directory?'openDirectory':'openFile'],filters:[{name:'导演台插件',extensions:['ddplugin']}]});
            return result.canceled?null:{path:result.filePaths[0]};
        }
        if(args.action==='import')return store.install(args.path);
        if(args.action==='enable'){await stop(args.id);return store.enable(args.id,args.enabled);}
        if(args.action==='stop'){await stop(args.id);return true;}
        if(args.action==='remove'){await stop(args.id);await store.remove(args.id);return true;}
        if(args.action==='backend'){
            const state=await worker(args.id),id=randomUUID();
            return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{state.pending.delete(id);reject(Error('插件后台请求超时'));},120000);state.pending.set(id,{resolve,reject,timer});state.child.postMessage({type:'invoke',id,method:args.method,args:args.input});});
        }
        if(args.action==='fetch'){
            const info=await store.info(args.id);if(!info.enabled||!info.permissions.includes('network'))throw Error('插件未声明网络能力');
            const url=new URL(args.url);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('网络地址无效');
            const response=await fetch(url,{...args.options,signal:AbortSignal.timeout(30000)});return {status:response.status,headers:Object.fromEntries(response.headers),body:Array.from(new Uint8Array(await response.arrayBuffer()))};
        }
        throw Error('未知插件操作');
    }
    ipcMain.handle('director-extensions',async(e,args)=>{if(!trusted(e))return {ok:false,error:'拒绝未知页面'};try{return {ok:true,data:await action(args)};}catch(error){return {ok:false,error:error.message};}});
    const stopAll=()=>{for(const id of workers.keys())void stop(id);};
    window.webContents.on('did-start-navigation',e=>{if(e.isMainFrame&&!e.isSameDocument)stopAll();});
    window.on('closed',()=>{stopAll();ipcMain.removeHandler('director-extensions');ipcMain.removeListener('director-extension-reply',reply);});
    return {asset:(id,digest,relative)=>store.asset(id,digest,relative)};
}
module.exports={attachExtensions};
