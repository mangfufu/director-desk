const fs=require('node:fs/promises'),sync=require('node:fs'),path=require('node:path');
const {spawn}=require('node:child_process');
const {unzipSync}=require('fflate'),tar=require('tar');
const {DOWNLOADS,WINDOWS_UV,TORCH_WHEELS}=require('./manifest.cjs');
const {downloadFile}=require('./download.cjs');
const {beginStage}=require('./install-progress.cjs');
function locations(root,platform=process.platform){
    const runtime=path.join(root,'runtime',`${platform}-x64`);
    return {runtime,python:path.join(runtime,'env',platform==='win32'?'Scripts/python.exe':'bin/python'),uv:path.join(runtime,'uv',platform==='win32'?'uv.exe':'uv'),repos:path.join(runtime,'repos')};
}
function environment(root,platform=process.platform){
    const env={...process.env},local=locations(root,platform);
    for(const key of ['PYTHONHOME','PYTHONPATH','VIRTUAL_ENV','CONDA_PREFIX'])delete env[key];
    const cache=path.join(root,'cache'),cacheDir=name=>path.join(cache,name);
    return {...env,DIRECTOR_RECON_ROOT:root,DIRECTOR_RECON_REPOS:local.repos,PYTHONUNBUFFERED:'1',PYTHONUTF8:'1',PYTHONNOUSERSITE:'1',
        PYTHONPYCACHEPREFIX:cacheDir('pycache'),TMPDIR:cacheDir('tmp'),TMP:cacheDir('tmp'),TEMP:cacheDir('tmp'),
        XDG_CACHE_HOME:cacheDir('xdg'),XDG_CONFIG_HOME:cacheDir('config'),XDG_DATA_HOME:cacheDir('data'),
        HF_HOME:cacheDir('huggingface'),HF_HUB_CACHE:cacheDir('huggingface/hub'),TORCH_HOME:cacheDir('torch'),
        UV_CACHE_DIR:cacheDir('uv'),UV_PYTHON_INSTALL_DIR:path.join(local.runtime,'python'),UV_PYTHON_BIN_DIR:path.join(local.runtime,'bin'),
        UV_PYTHON_INSTALL_BIN:'false',UV_PYTHON_INSTALL_REGISTRY:'false',UV_PYTHON_PREFERENCE:'only-managed',UV_NO_CONFIG:'true',
        UV_HTTP_TIMEOUT:'600',UV_CONCURRENT_DOWNLOADS:'2',
        PIP_CACHE_DIR:cacheDir('pip'),PIP_CONFIG_FILE:platform==='win32'?'NUL':'/dev/null',
        MPLCONFIGDIR:cacheDir('matplotlib'),CUDA_CACHE_PATH:cacheDir('cuda'),TORCH_EXTENSIONS_DIR:cacheDir('torch-extensions'),
    };
}
function stopTree(child,platform=process.platform){
    if(!child?.pid)return;
    if(platform==='win32'){
        const killer=spawn(path.join(process.env.SystemRoot||'C:/Windows','System32/taskkill.exe'),['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
        killer.on('error',()=>child.kill());
    }else{try{process.kill(-child.pid,'SIGKILL');}catch{child.kill('SIGKILL');}}
}
function runProcess(executable,args,{root,task,signal,onLine=()=>{},platform=process.platform,spawnProcess=spawn}){
    return new Promise((resolve,reject)=>{
        signal?.throwIfAborted();const log=sync.createWriteStream(path.join(task.directory,'run.log'),{flags:'a'});
        const child=spawnProcess(executable,args,{cwd:root,env:environment(root,platform),windowsHide:true,detached:platform!=='win32',stdio:['ignore','pipe','pipe']});
        let tail='',partial='',finished=false;
        const cancel=()=>stopTree(child,platform);signal?.addEventListener('abort',cancel,{once:true});
        const finish=error=>{if(finished)return;finished=true;signal?.removeEventListener('abort',cancel);log.end();error?reject(error):resolve();};
        const output=chunk=>{const value=chunk.toString();log.write(value);tail=(tail+value).slice(-3000);partial+=value;
            const lines=partial.split(/[\r\n]+/);partial=lines.pop();for(const line of lines)onLine(line);};
        child.stdout.on('data',output);child.stderr.on('data',output);
        log.on('error',error=>{cancel();finish(error);});child.once('error',finish);
        child.once('close',code=>finish(code===0&&!signal?.aborted?undefined:Error(signal?.aborted?'已取消':tail.trim().split('\n').slice(-4).join('\n')||`运行失败（${code}）`)));
    });
}
async function extract(archive,target,strip,signal){
    await fs.mkdir(target,{recursive:true});
    if(archive.endsWith('.zip')){
        const files=unzipSync(new Uint8Array(await fs.readFile(archive)));
        for(const [name,data] of Object.entries(files)){
            signal?.throwIfAborted();if(name.endsWith('/'))continue;
            const parts=name.split('/').slice(strip);if(!parts.length)continue;
            if(parts.some(p=>!p||p==='..'||p==='.'||p.includes('\\')||p.includes(':')))throw Error('安装文件路径无效');
            const file=path.join(target,...parts);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,data);
        }
    }else await tar.x({file:archive,cwd:target,strip,strict:true,preservePaths:false,
        filter:(name,entry)=>{signal?.throwIfAborted();if(!['File','Directory'].includes(entry.type))throw Error('安装包包含不支持的链接');return true;}});
}
async function installRuntime(root,{task,signal,fetch:fetcher,platform=process.platform,download=downloadFile,run=runProcess}){
    const local=locations(root,platform),uv=platform==='win32'?WINDOWS_UV:DOWNLOADS[3];
    const items=[uv,DOWNLOADS[1],DOWNLOADS[2],DOWNLOADS[0]];
    beginStage(task,'components');
    for(const [index,item] of items.entries()){
        signal.throwIfAborted();if(index===3)beginStage(task,'model');task.downloadFile=path.basename(item.file);task.detail=['启动组件','识别组件','图像组件','Human3R'][index];
        await download(item,root,{fetch:fetcher,signal,status:status=>{task.detail=`${['启动组件','识别组件','图像组件','Human3R'][index]} · ${status}`;},progress:(n,total)=>{task.downloadedBytes=n;task.totalBytes=total;task.progress=(index+(total?n/total:0))*65/items.length;}});
    }
    beginStage(task,'extract');
    await extract(path.join(root,uv.file),path.dirname(local.uv),platform==='win32'?0:1,signal);
    await extract(path.join(root,DOWNLOADS[1].file),path.join(local.repos,'Human3R'),1,signal);
    await extract(path.join(root,DOWNLOADS[2].file),path.join(local.repos,'dinov2'),1,signal);
    const command=async args=>{signal.throwIfAborted();await run(local.uv,['--no-config',...args],{root,task,signal,platform,onLine:line=>{const downloading=/^Downloading\s+([A-Za-z0-9_.+-]+)(?:\s+\(([^)]+)\))?/.exec(line);if(downloading)task.detail=['正在下载',downloading[1],downloading[2]].filter(Boolean).join(' · ');}});};
    beginStage(task,'python');task.progress=68;
    await command(['venv',path.join(local.runtime,'env'),'--python','3.12','--allow-existing']);
    beginStage(task,'compute-download');
    for(const [index,item] of TORCH_WHEELS[platform].entries()){
        task.downloadFile=path.basename(item.file);task.detail=`${index+1} / ${TORCH_WHEELS[platform].length}`;
        await download(item,root,{fetch:fetcher,signal,status:status=>{task.detail=`${index+1} / ${TORCH_WHEELS[platform].length} · ${status}`;},progress:(n,total)=>{task.downloadedBytes=n;task.totalBytes=total;task.progress=70+(index+(total?n/total:0))*8;}});
    }
    delete task.downloadedBytes;delete task.totalBytes;
    beginStage(task,'compute-install');task.progress=88;
    await command(['pip','install','--python',local.python,...TORCH_WHEELS[platform].map(item=>path.join(root,item.file))]);
    beginStage(task,'dependencies');task.progress=92;
    await command(['pip','install','--python',local.python,'numpy<2','transformers==4.46.3','accelerate','roma','huggingface-hub<1','opencv-python-headless<4.12','scipy','einops','trimesh','matplotlib','pillow','smplx','imageio','tqdm','hydra-core','safetensors']);
    beginStage(task,'verify');task.progress=95;
    await run(local.python,['-c',"import torch,cv2,transformers,scipy,smplx; assert torch.cuda.is_available(), 'NVIDIA GPU unavailable: please install or update its driver'; print(torch.cuda.get_device_name(0))"],{root,task,signal,platform});
}
module.exports={locations,environment,runProcess,installRuntime,extract};
