const fs=require('node:fs/promises'),path=require('node:path');

// Successful results must embed their models before temporary copies are removed.
async function cleanRun(root,directory,{discardFailed=false}={}){
    if(!await require('./storage.cjs').owned(root))throw Error('此目录不是软件管理的运行目录');
    const realRoot=await fs.realpath(root),runs=path.join(realRoot,'runs'),dir=path.resolve(directory);
    if(path.dirname(dir)!==runs||await fs.realpath(dir)!==dir)throw Error('转换目录无效');
    if(await fs.realpath(runs)!==runs)throw Error('转换目录无效');
    const read=async name=>{
        const file=path.join(dir,name);if(!(await fs.lstat(file)).isFile())throw Error('转换文件无效');
        return JSON.parse(await fs.readFile(file,'utf8'));
    };
    const task=await read('task.json');
    if(task.kind==='convert'&&(task.status==='cancelled'||discardFailed&&['failed','interrupted'].includes(task.status))){
        if(task.engine==='flowhmr')await removeFlowWork(dir);
        return removeGeneratedFiles(dir,(await fs.readdir(dir)).filter(name=>/^frame-\d{5,}\.npz$/.test(name)||/^(?:surface|environment|person)-[\w-]+\.glb$/.test(name)));
    }
    if(task.kind!=='convert'||task.status!=='completed')return 0;
    const document=await read('reconstructed.director'),scene=await read('scene.json'),analysis=await read('analysis.json');
    if(document.format!=='director-desk'||document.version!==3||!Array.isArray(document.resources)||!Array.isArray(document.scenes)||!document.scenes.length)throw Error('工程无效，未清理转换文件');
    const names=[];
    // Confirm that every generated model is already embedded, byte for byte.
    for(const object of scene.objects){
        const name=object.file;
        if(typeof name!=='string'||! /^(?:surface|environment|person)-[\w-]+\.glb$/.test(name))throw Error('转换资源路径无效');
        const embedded=document.resources.flatMap(r=>r.package?.files||[]).find(f=>f.path===name);
        if(!embedded||typeof embedded.data!=='string')throw Error('工程缺少模型，未清理转换文件');
        try{
            const file=path.join(dir,name);if(!(await fs.lstat(file)).isFile())throw Error('转换资源无效');
            if(!(await fs.readFile(file)).equals(Buffer.from(embedded.data,'base64')))throw Error('工程模型不一致，未清理转换文件');
            names.push(name);
        }catch(e){if(e.code!=='ENOENT')throw e;}
    }
    for(const frame of analysis.frames){if(!/^frame-\d{5,}\.npz$/.test(frame.file))throw Error('转换帧路径无效');names.push(frame.file);}
    if(task.engine==='flowhmr')await removeFlowWork(dir);
    return removeGeneratedFiles(dir,names);
}

async function removeFlowWork(dir){
    // Only this adapter's disposable folder; retain original predictions and the project.
    const target=path.join(dir,'flow-work');
    try{if((await fs.lstat(target)).isSymbolicLink()||await fs.realpath(target)!==target)throw Error('转换缓存目录无效');await fs.rm(target,{recursive:true,force:true});}catch(e){if(e.code!=='ENOENT')throw e;}
}

async function removeGeneratedFiles(dir,names){
    let removed=0;
    const removeFile=async file=>{try{const stat=await fs.lstat(file);if(!stat.isFile())return;await fs.unlink(file);removed+=stat.size;}catch(e){if(e.code!=='ENOENT')throw e;}};
    for(const name of new Set(names))await removeFile(path.join(dir,name));
    const frames=path.join(dir,'frames');
    try{if((await fs.lstat(frames)).isDirectory()&&await fs.realpath(frames)===frames){
        for(const name of await fs.readdir(frames))if(/^\d{5,}\.jpg$/.test(name))await removeFile(path.join(frames,name));
        try{await fs.rmdir(frames);}catch(e){if(!['ENOTEMPTY','EEXIST'].includes(e.code))throw e;}
    }}catch(e){if(e.code!=='ENOENT')throw e;}
    return removed;
}

async function cleanInactiveRuns(root,engine){
    const directory=path.join(await fs.realpath(root),'runs');let removed=0;
    try{
        if(await fs.realpath(directory)!==directory)throw Error('转换目录无效');
        for(const entry of await fs.readdir(directory,{withFileTypes:true}))if(entry.isDirectory()){
            if(engine){const task=await fs.readFile(path.join(directory,entry.name,'task.json'),'utf8').then(JSON.parse).catch(()=>null);if(!task||(task.engine||'human3r')!==engine)continue;}
            // Never discard inputs for a corrupt completed project or active run.
            try{removed+=await cleanRun(root,path.join(directory,entry.name),{discardFailed:true});}catch{}
        }
    }catch(e){if(e.code!=='ENOENT')throw e;}
    return removed;
}
module.exports={cleanRun,cleanInactiveRuns};
