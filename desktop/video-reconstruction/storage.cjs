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
// Human3R used these paths before multiple engines were supported. Keep its
// ownership explicit so removing it never removes another engine or user files.
function scope(engine){
    if(engine==='flowhmr')return {models:['flowhmr/models'],runtime:['flowhmr/runtime'],cache:['flowhmr/cache'],markers:[],partials:[...require('./flow-manifest.cjs').MODELS.map(m=>'flowhmr/'+m.file+'.part'),'flowhmr/models/body_models/smplh/neutral/model.npz.part']};
    if(engine==='mediapipe')return {models:['models/pose_landmarker_lite.task','models/pose_landmarker_lite.task.part'],runtime:['runtime/lite'],cache:[],markers:[],partials:require('./lite-runtime.cjs').FILES.map(f=>f.file+'.part')};
    if(engine==='human3r')return {models:['models/human3r_672S.pth','models/human3r_672S.pth.part'],runtime:['runtime/win32-x64','runtime/linux-x64'],cache:['pycache','tmp','xdg','config','data','huggingface','torch','uv','pip','matplotlib','cuda','torch-extensions','wheels','human3r.tar.gz','human3r.tar.gz.part','dinov2.tar.gz','dinov2.tar.gz.part','uv-linux.tar.gz','uv-linux.tar.gz.part','uv-windows.zip','uv-windows.zip.part'].map(f=>'cache/'+f),markers:['ready.json'],partials:['models/human3r_672S.pth.part']};
    throw Error('未知识别方式');
}
async function checkedPath(root,name){
    const target=path.resolve(root,name),relative=path.relative(root,target);
    if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw Error('清理目录无效');
    // A fixed nested target can still have a replaced parent (junction/symlink).
    let parent=path.dirname(target);
    while(parent!==root){try{if((await fs.lstat(parent)).isSymbolicLink())throw Error('清理目录包含链接');}catch(e){if(e.code!=='ENOENT')throw e;}parent=path.dirname(parent);}
    return target;
}
async function usage(root,engine){
    const categories={},seen=new Set(),io=limiter(16);
    if(engine!==undefined){
        const paths=scope(engine),realRoot=await fs.realpath(root).catch(e=>{if(e.code==='ENOENT')return path.resolve(root);throw e;});
        for(const key of ['models','runtime','cache']){categories[key]=0;for(const name of paths[key])categories[key]+=await size(await checkedPath(realRoot,name),seen,io);}
        categories.runs=0;
        const runs=path.join(realRoot,'runs');
        try{if(!(await fs.lstat(runs)).isSymbolicLink())for(const entry of await fs.readdir(runs,{withFileTypes:true}))if(entry.isDirectory()){
            const dir=path.join(runs,entry.name),task=await fs.readFile(path.join(dir,'task.json'),'utf8').then(JSON.parse).catch(()=>null);
            if(task&&(task.engine||'human3r')===engine)categories.runs+=await size(dir,seen,io);
        }}catch(e){if(e.code!=='ENOENT')throw e;}
    }else for(const key of ['models','runtime','cache','runs'])categories[key]=await size(path.join(root,key),seen,io);
    let availableBytes;try{const stat=await fs.statfs(root);availableBytes=Number(stat.bavail)*Number(stat.bsize);}catch{}
    return {...categories,total:Object.values(categories).reduce((a,b)=>a+b,0),availableBytes,managed:await owned(root),...(engine?{engine}:{})};
}
async function remove(root,kind,engine){
    if(!await owned(root))throw Error('此目录不是软件管理的运行目录，未删除任何文件');
    if(!['cache','runtime'].includes(kind))throw Error('未知清理范围');
    // Fixed children only; never delete the chosen directory or follow linked folders.
    const realRoot=await fs.realpath(root),paths=engine!==undefined?scope(engine):null;
    const names=paths?[...paths.cache,...paths.partials,...(kind==='runtime'?[...paths.runtime,...paths.models,...paths.markers]:[])]:kind==='cache'?['cache']:['runtime','models','cache','ready.json'];
    const targets=await Promise.all([...new Set(names)].map(name=>checkedPath(realRoot,name)));
    for(const target of targets)await fs.rm(target,{recursive:true,force:true});
    await require('./artifacts.cjs').cleanInactiveRuns(realRoot,engine);
    return usage(root,engine);
}
module.exports={initialize,usage,remove,owned};
