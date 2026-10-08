const {pathToFileURL}=require('node:url');
const pending=new Map();let next=0,extension;
const send=value=>process.parentPort.postMessage(value);
const request=(method,args)=>new Promise((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject});send({type:'editor',id,method,args});});
process.parentPort.on('message',async({data:m})=>{
    if(m.type==='reply'){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error)):p.resolve(m.result);}return;}
    try{
        if(m.type==='start'){
            const mod=await import(pathToFileURL(m.entry).href);
            extension=await mod.activate({id:m.pluginId,dataDirectory:m.dataDirectory,callEditor:request,callTool:(name,args)=>request('tool',{name,args})});send({type:'ready'});
        }else if(m.type==='invoke'){
            if(!extension||typeof extension[m.method]!=='function')throw Error('后台方法不存在');
            const result=await extension[m.method](m.args);send({type:'result',id:m.id,result});
        }else if(m.type==='stop'){await extension?.dispose?.();send({type:'stopped'});process.exit(0);}
    }catch(error){send({type:m.type==='start'?'startup-error':'result',id:m.id,error:String(error?.message||error)});}
});
