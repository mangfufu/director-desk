const fs=require('node:fs/promises'),path=require('node:path');
const {SOURCES,MODELS,VERSION,MODEL}=require('./flow-manifest.cjs');
const {WINDOWS_UV,DOWNLOADS}=require('./manifest.cjs');
const {locations,extract,runProcess}=require('./runtime.cjs');
const {downloadFile}=require('./download.cjs');
const {beginStage}=require('./install-progress.cjs');
function paths(root,platform=process.platform){const base=path.join(root,'flowhmr'),local=locations(base,platform);return {...local,base,repo:path.join(local.runtime,'repo'),body:path.join(base,'models/body_models/smplh/neutral/model.npz'),marker:path.join(local.runtime,'ready.json')};}
async function status(root,platform=process.platform){
    const p=paths(root,platform),present=async(file,bytes)=>fs.stat(file).then(s=>s.isFile()&&(bytes?s.size===bytes:s.size>0),()=>false);
    const marker=await fs.readFile(p.marker,'utf8').then(JSON.parse).catch(()=>null);
    const runtimeReady=marker?.version===VERSION&&await present(p.python);
    const modelsReady=(await Promise.all(MODELS.map(m=>present(path.join(p.base,m.file),m.bytes)))).every(Boolean);
    const bodyReady=await present(p.body);
    return {runtimeReady,modelsReady,bodyReady,ready:runtimeReady&&modelsReady&&bodyReady,correctionReady:!!marker?.correctionReady};
}
const environment=p=>({DIRECTOR_FLOW_MODELS:path.join(p.base,'models'),DIRECTOR_FLOW_DINO:path.join(p.repo,'third_party/dinov3'),FLOWHMR_ATTENTION_BACKEND:'query_batched',FLOWHMR_ATTENTION_QUERY_CHUNK_SIZE:'256'});
async function patchSources(repo){
    const modelFile=path.join(repo,'flowhmr/model_files.py'),source=await fs.readFile(modelFile,'utf8');
    if(!source.includes('DIRECTOR_FLOW_MODELS')){if(!source.includes('MODEL_ROOT = PROJECT_ROOT / "models"'))throw Error('FlowHMR 模型目录格式不匹配');await fs.writeFile(modelFile,source.replace('MODEL_ROOT = PROJECT_ROOT / "models"','import os\nMODEL_ROOT = Path(os.environ["DIRECTOR_FLOW_MODELS"])'));}
    const backbone=path.join(repo,'third_party/sam-3d-body/sam_3d_body/models/backbones/dinov3.py'),text=await fs.readFile(backbone,'utf8');
    if(!text.includes('DIRECTOR_FLOW_DINO')){if(!text.includes('"facebookresearch/dinov3"'))throw Error('FlowHMR 图像组件格式不匹配');await fs.writeFile(backbone,'import os\n'+text.replace('"facebookresearch/dinov3"','os.environ["DIRECTOR_FLOW_DINO"]').replace('source="github"','source="local"'));}
}
async function install(root,{task,signal,fetch,platform=process.platform,run=runProcess,assetsDirectory,download=downloadFile}){
    task.steps=[['components','下载基础组件'],['python','准备运行环境'],['dependencies','安装识别依赖'],['verify','检查显卡'],['model','下载识别模型']].map(([id,label])=>({id,label,status:'pending'}));
    const p=paths(root,platform);await fs.mkdir(path.join(p.base,'cache/tmp'),{recursive:true});
    const common={root:p.base,task,signal,platform,env:environment(p)};
    const fetchFile=async item=>{task.downloadFile=path.basename(item.file);await download(item,p.base,{fetch,signal,progress:(n,total)=>{task.downloadedBytes=n;task.totalBytes=total;}});};
    beginStage(task,'components');const uv=platform==='win32'?WINDOWS_UV:DOWNLOADS[3];await fetchFile(uv);await extract(path.join(p.base,uv.file),path.dirname(p.uv),platform==='win32'?0:1,signal);
    for(const source of SOURCES){await fetchFile(source);await extract(path.join(p.base,source.file),path.join(p.runtime,source.target),1,signal,{skipLinks:true});}
    await patchSources(p.repo);delete task.downloadedBytes;delete task.totalBytes;
    beginStage(task,'python');task.progress=10;
    const command=args=>run(p.uv,['--no-config',...args],{...common,onLine:line=>{if(/^Downloading |^Installing |^Prepared /.test(line))task.detail=line;}});
    await command(['venv',path.join(p.runtime,'env'),'--python','3.10','--allow-existing']);
    beginStage(task,'dependencies');task.progress=20;
    await command(['pip','install','--python',p.python,'--extra-index-url','https://download.pytorch.org/whl/cu128','--index-strategy','unsafe-best-match','-r',path.join(assetsDirectory,'flow-requirements.txt')]);
    beginStage(task,'verify');
    await run(p.python,[path.join(assetsDirectory,'flow-worker.py'),'check','--repo',p.repo],{...common,cwd:p.repo});
    await fs.writeFile(p.marker,JSON.stringify({version:VERSION,correctionReady:false}));
    beginStage(task,'model');
    for(const [i,item] of MODELS.entries()){task.progress=30+65*i/MODELS.length;await fetchFile(item);}
}
async function run(root,{task,signal,platform=process.platform,assetsDirectory,run:execute=runProcess}){
    const p=paths(root,platform);const input=path.join(task.directory,'flow-input.json');await fs.writeFile(input,JSON.stringify(task.input));
    await execute(p.python,[path.join(assetsDirectory,'flow-worker.py'),'run','--repo',p.repo,'--input',input,'--output',task.directory],{
        root:p.base,cwd:p.repo,task,signal,platform,env:environment(p),onLine:line=>{
            if(line.startsWith('DIRECTOR_PROGRESS ')){try{const value=JSON.parse(line.slice(18));task.message=value.message;task.progress=Math.min(94,Math.max(0,value.progress));}catch{}}
        },
    });
}
async function importBody(root,file,{platform=process.platform,assetsDirectory,run:execute=runProcess,signal,task}){
    const p=paths(root,platform);if(!path.isAbsolute(file)||!await fs.stat(file).then(s=>s.isFile(),()=>false))throw Error('请选择人体文件');
    if(!(await status(root,platform)).runtimeReady)throw Error('请先下载 FlowHMR 运行环境');
    await execute(p.python,[path.join(assetsDirectory,'flow-worker.py'),'import-body','--repo',p.repo,'--input',file,'--output',p.body],{root:p.base,cwd:p.repo,task,signal,platform,env:environment(p)});
}
module.exports={MODEL,VERSION,paths,status,install,run,importBody,patchSources};
