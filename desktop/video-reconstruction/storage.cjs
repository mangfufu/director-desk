const fs=require('node:fs/promises'),path=require('node:path');
const MARKER='.director-video-runtime.json',FORMAT='director-video-runtime';
async function owned(root){try{return JSON.parse(await fs.readFile(path.join(root,MARKER),'utf8')).format===FORMAT;}catch{return false;}}
async function initialize(root){
    await fs.mkdir(root,{recursive:true});if(await owned(root))return;
    if((await fs.readdir(root)).length)throw Error('所选目录已有其他文件，请选择空目录');
    await fs.writeFile(path.join(root,MARKER),JSON.stringify({format:FORMAT,version:1}));
}
function limiter(limit){let running=0;const queue=[];return async fn=>{if(running>=limit)await new Promise(resolve=>queue.push(resolve));running++;try{return await fn();}finally{running--;queue.shift()?.();}};}
async function size(file,seen,io){
    let info;try{info=await io(()=>fs.lstat(file));}catch(e){if(e.code==='ENOENT')return 0;throw e;}
    if(info.isSymbolicLink())return 0;if(info.isFile()){
        const key=`${info.dev}:${info.ino}`;if(info.nlink>1&&info.ino){if(seen.has(key))return 0;seen.add(key);}return info.size;
    }if(!info.isDirectory())return 0;
    const entries=await io(()=>fs.readdir(file));return (await Promise.all(entries.map(entry=>size(path.join(file,entry),seen,io)))).reduce((a,b)=>a+b,0);
}
async function usage(root){
    const categories={},seen=new Set(),io=limiter(16);for(const key of ['models','runtime','cache','runs'])categories[key]=await size(path.join(root,key),seen,io);
    let availableBytes;try{const stat=await fs.statfs(root);availableBytes=Number(stat.bavail)*Number(stat.bsize);}catch{}
    return {...categories,total:Object.values(categories).reduce((a,b)=>a+b,0),availableBytes,managed:await owned(root)};
}
async function remove(root,kind){
    if(!await owned(root))throw Error('此目录不是软件管理的运行目录，未删除任何文件');
    if(!['cache','runtime'].includes(kind))throw Error('未知清理范围');
    // Fixed children only; never delete the chosen directory or follow linked folders.
    const realRoot=await fs.realpath(root),names=kind==='cache'?['cache']:['runtime','models','cache','ready.json'];
    for(const name of names){const target=path.resolve(realRoot,name);if(path.dirname(target)!==realRoot)throw Error('清理目录无效');
        await fs.rm(target,{recursive:true,force:true});}
    await require('./artifacts.cjs').cleanInactiveRuns(realRoot);
    return usage(root);
}
module.exports={initialize,usage,remove,owned};
