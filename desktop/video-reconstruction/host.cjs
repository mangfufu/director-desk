const fs=require('node:fs/promises'),sync=require('node:fs'),path=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const {MODEL,RUNTIME_VERSION}=require('./manifest.cjs');
const {reconstructionActorModel}=require('../../src/reconstruction/actor-model.ts');
const {assertAnalysisDuration}=require('../../src/reconstruction/interval.ts');
const {locations,runProcess,installRuntime}=require('./runtime.cjs');
const storage=require('./storage.cjs');
const {installationRecord,previousInstallation}=require('./installation-record.cjs');
async function createReconstructionHost({directory,assetsDirectory,buildProject,fetch:fetcher=fetch,platform=process.platform,arch=process.arch,run:runCommand=runProcess,install:install=installRuntime}){
    await fs.mkdir(directory,{recursive:true});
    const settingsFile=path.join(directory,'settings.json'),jobFile=path.join(directory,'last-job.json');
    const licenseText=await fs.readFile(path.join(assetsDirectory,'Human3R-LICENSE.txt'),'utf8');
    const licenseVersion=createHash('sha256').update(licenseText).digest('hex');
    let settings={runtimeRoot:path.join(directory,'runtime'),configVersion:2},job=null,disposed=false,ready=false,writing=false,running=false,aborter,installation=null,installationRoot;
    try{settings={...settings,...JSON.parse(await fs.readFile(settingsFile,'utf8'))};}catch(e){if(e.code!=='ENOENT')settings={runtimeRoot:path.join(directory,'runtime'),configVersion:2};}
    if(settings.distribution!==undefined){settings.runtimeRoot=path.join(settings.runtimeRoot,'native-runtime');delete settings.distribution;}
    try{job=JSON.parse(await fs.readFile(jobFile,'utf8'));}catch{}
    const supported=['win32','linux'].includes(platform)&&arch==='x64';
    const accepted=()=>settings.consent?.version===licenseVersion;
    const busy=()=>writing||running||job?.status==='running';
    const persistSettings=async()=>{await fs.writeFile(settingsFile+'.tmp',JSON.stringify(settings));await fs.rename(settingsFile+'.tmp',settingsFile);};
    const writeJson=async(file,value)=>{await fs.writeFile(file+'.tmp',JSON.stringify(value));await fs.rename(file+'.tmp',file);};
    const persist=()=>writeJson(jobFile,job);
    const persistTask=task=>writeJson(path.join(task.directory,'task.json'),{...task,pipelineVersion:RUNTIME_VERSION,manualIntervention:false});
    if(job?.status==='running'){
        job.status='interrupted';job.message='上次任务已中断';require('./install-progress.cjs').finishStages(job,'interrupted');
        // Recover only our own direct run directory; never follow a replaced link.
        if(typeof job.directory==='string'&&await storage.owned(settings.runtimeRoot)){
            const root=await fs.realpath(settings.runtimeRoot),runs=path.join(root,'runs'),dir=path.resolve(job.directory);
            try{
                if(path.dirname(dir)===runs&&await fs.realpath(runs)===runs&&await fs.realpath(dir)===dir){
                    const recorded=await fs.readFile(path.join(dir,'task.json'),'utf8').then(JSON.parse).catch(()=>null);
                    if(recorded?.id===job.id&&['completed','failed','cancelled'].includes(recorded.status))job={...recorded,directory:dir};
                    await persistTask(job);
                }
            }catch(e){if(e.code!=='ENOENT')throw e;}
        }
        await persist();
    }
    const snapshot=()=>{
        let task=null;if(job){const {cancelFile,directory,requestSignature,...visible}=job;task=visible;}
        return {supported,accepted:accepted(),ready,settings:{runtimeRoot:settings.runtimeRoot},model:{...MODEL,licenseVersion,licenseText},job:task,installation};
    };
    async function checkReady(){
        ready=false;
        if(installationRoot!==settings.runtimeRoot){installation=null;installationRoot=undefined;}
        try{
            const marker=JSON.parse(await fs.readFile(path.join(settings.runtimeRoot,'ready.json'),'utf8'));
            if(marker.version!==RUNTIME_VERSION||marker.modelHash!==MODEL.sha256)return;
            if(installationRoot!==settings.runtimeRoot){installation=await previousInstallation(settings.runtimeRoot,marker);installationRoot=settings.runtimeRoot;}
            const stat=await fs.stat(path.join(settings.runtimeRoot,'models/human3r_672S.pth'));if(stat.size!==MODEL.bytes)return;
            const local=locations(settings.runtimeRoot,platform);
            for(const file of [local.python,path.join(local.repos,'Human3R/demo.py'),path.join(local.repos,'dinov2/hubconf.py')])await fs.access(file);
            ready=true;
        }catch{}
    }
    await checkReady();
    function assertUsable(){if(disposed)throw Error('软件正在关闭');if(!supported)throw Error('此功能需要 Windows / Linux x64 和 NVIDIA 显卡');}
    function requireConsent(){if(!accepted())throw Error('LICENSE_REQUIRED：请在“视频反推”中阅读并同意模型许可');}
    async function execute(script,args,task){
        const root=settings.runtimeRoot;
        await runCommand(locations(root,platform).python,[path.join(assetsDirectory,script),...args],{root,task,signal:aborter.signal,platform,onLine:line=>{
            const frame=/Frame (\d+)\/(\d+)/.exec(line);
            const result=/Result (\d+)\/(\d+)/.exec(line),scene=/Scene (\d+)\/(\d+)/.exec(line);
            if(frame){task.message=`分析画面 ${frame[1]} / ${frame[2]}`;task.progress=15+50*Number(frame[1])/Number(frame[2]);}
            else if(result){task.message=`整理识别结果 ${result[1]} / ${result[2]}`;task.progress=65+18*Number(result[1])/Number(result[2]);}
            else if(scene){task.message=`生成场景 ${scene[1]} / ${scene[2]}`;task.progress=83+10*Number(scene[1])/Number(scene[2]);}
            else if(line.startsWith('STAGE '))task.message=line.slice(6);
            else if(line.startsWith('Loading model'))task.message='加载模型';
        }});
    }
    async function run(task){
        try{
            aborter=new AbortController();
            if(task.kind==='download'){
                ready=false;
                await install(settings.runtimeRoot,{task,signal:aborter.signal,fetch:fetcher,platform,run:runCommand});
                if(task.cancelled)throw Error('已取消');
                await fs.writeFile(path.join(settings.runtimeRoot,'ready.json'),JSON.stringify({version:RUNTIME_VERSION,modelHash:MODEL.sha256}));
                ready=true;task.message='模型已就绪';
            }else{
                task.message='准备模型';task.progress=5;
                await execute('run-inference.py',['--input',task.input.path,'--start',String(task.input.start),'--seconds',String(task.input.seconds),'--fps',String(task.input.fps),'--output',task.directory,'--scene',task.input.scene],task);
                if(task.cancelled)throw Error('已取消');task.message=task.input.scene==='none'?'生成人物':'生成场景';task.progress=83;
                await execute('convert-analysis.py',['--input',task.directory,'--scene',task.input.scene],task);
                if(task.cancelled)throw Error('已取消');task.message='生成工程';task.progress=95;
                const result=await buildProject(task.directory,{actorModel:task.input.actorModel});if(task.cancelled)throw Error('已取消');
                const analysis=JSON.parse(await fs.readFile(path.join(task.directory,'analysis.json'),'utf8'));
                task.file=result.file;task.summary={duration:analysis.duration,objects:result.entities,inferenceSeconds:analysis.inferenceSeconds,peakGiB:analysis.peakAllocatedGiB};task.message='转换完成';
            }
            task.status='completed';task.progress=100;
            if(task.kind==='download')require('./install-progress.cjs').finishStages(task,'completed');
        }catch(error){task.status=task.cancelled?'cancelled':'failed';task.message=task.cancelled?'已取消':error.message;if(task.kind==='download')require('./install-progress.cjs').finishStages(task,task.status);}
        finally{
            aborter=undefined;task.finishedAt=Date.now();task.elapsedSeconds=(task.finishedAt-task.startedAt)/1000;
            try{
                if(task.kind==='download'&&task.status==='completed'){installation=installationRecord(task);installationRoot=settings.runtimeRoot;await fs.writeFile(path.join(settings.runtimeRoot,'ready.json'),JSON.stringify({version:RUNTIME_VERSION,modelHash:MODEL.sha256,installation}));}
                await persistTask(task);
                if(['completed','cancelled'].includes(task.status))try{
                    if(task.kind==='convert')await require('./artifacts.cjs').cleanRun(settings.runtimeRoot,task.directory);
                    else if(task.status==='completed')await storage.remove(settings.runtimeRoot,'cache');
                }catch(error){await fs.appendFile(path.join(task.directory,'run.log'),`\nCleanup: ${error.message}\n`);}
                await persist();
            }finally{running=false;}
        }
    }
    async function begin(kind,input={}){
        assertUsable();requireConsent();
        if(input.requestId&&job?.requestId===input.requestId){
            if(job.kind!==kind||job.requestSignature!==JSON.stringify(input))throw Error('requestId 已用于不同操作');return snapshot();
        }
        if(busy())throw Error('已有任务正在进行');writing=true;let started;
        try{
            let values;
            if(kind==='convert'){
                await checkReady();if(!ready)throw Error('请先下载模型');
                if(typeof input.path!=='string'||!path.isAbsolute(input.path))throw Error('请选择视频');
                const source=path.resolve(input.path);if(!(await fs.stat(source)).isFile())throw Error('请选择视频文件');
                values={path:source,start:input.start??0,seconds:input.seconds??10,fps:input.fps??6,scene:input.scene??'planes',actorModel:reconstructionActorModel(input.actorModel)};
                if(!Number.isFinite(values.start)||values.start<0||!Number.isFinite(values.seconds)||values.seconds<0||!Number.isFinite(values.fps)||values.fps<1||values.fps>24||!['none','planes','mesh'].includes(values.scene))throw Error('时间范围或分析精度无效');
                if(values.seconds!==0)assertAnalysisDuration(values.seconds,values.fps);
            }
            await storage.initialize(settings.runtimeRoot);
            const id=randomUUID(),output=path.join(settings.runtimeRoot,'runs',id);await fs.mkdir(output,{recursive:true});await fs.mkdir(path.join(settings.runtimeRoot,'cache/tmp'),{recursive:true});
            job={id,kind,status:'running',message:'准备中',progress:0,startedAt:Date.now(),directory:output,cancelFile:path.join(output,'.cancel'),input:values,cancelled:false,requestId:input.requestId,requestSignature:JSON.stringify(input)};
            started=job;
            await persist();await persistTask(job);running=true;const task=job;void run(task).catch(error=>{task.status='failed';task.message=error.message;running=false;});return snapshot();
        }catch(error){
            if(started){started.status='failed';started.message=error.message;await persistTask(started).catch(()=>{});await persist().catch(()=>{});}
            throw error;
        }finally{writing=false;}
    }
    return {
        state:snapshot,isBusy:busy,
        async handle(action,input={},userGesture=false){
            if(action==='state')return snapshot();
            if(action==='storage')return storage.usage(settings.runtimeRoot);
            if(action==='preview'){
                if(job?.kind!=='convert'||!job.directory)return null;
                try{
                    let frames=[];try{frames=JSON.parse(await fs.readFile(path.join(job.directory,'previews.json'),'utf8'));}catch(e){if(e.code!=='ENOENT'&&!(e instanceof SyntaxError))throw e;}
                    const selected=input.frame;
                    if(selected!==undefined&&(!Number.isInteger(selected)||!frames.some(f=>f.sequence===selected)))throw Error('预览帧不存在');
                    const file=path.join(job.directory,selected===undefined?'preview.json':`previews/${selected}.json`);if((await fs.stat(file)).size>600000)throw Error('预览数据过大');
                    const value=JSON.parse(await fs.readFile(file,'utf8'));if(selected===undefined&&input.jobId===job.id&&input.sequence===value.sequence)return null;return {...value,frames,jobId:job.id};
                }catch(e){if(e.code==='ENOENT'||e instanceof SyntaxError)return null;throw e;}
            }
            if(action==='download')return begin('download',input);
            if(action==='start')return begin('convert',input);
            if(action==='cancel'){if(job?.status==='running'){job.cancelled=true;job.message='正在取消';aborter?.abort();await fs.writeFile(job.cancelFile,'cancel');}return snapshot();}
            if(action==='result'){if(job?.status!=='completed'||!job.file)throw Error('还没有完成的工程');await fs.access(job.file);return {path:job.file};}
            if(busy())throw Error('请先结束当前任务');
            assertUsable();
            if(action==='clear-cache'||action==='remove-runtime'){
                writing=true;try{await storage.remove(settings.runtimeRoot,action==='clear-cache'?'cache':'runtime');if(action==='remove-runtime'){installation=null;installationRoot=undefined;}await checkReady();if(action==='remove-runtime'&&job?.kind==='download'){job=null;await persist();}return snapshot();}finally{writing=false;}
            }
            if(action==='accept-license'){
                if(!userGesture||input.version!==licenseVersion||input.accepted!==true)throw Error('请由用户在界面确认当前模型许可');
                settings.consent={version:licenseVersion,acceptedAt:new Date().toISOString()};await persistSettings();return snapshot();
            }
            if(action==='configure'){
                if(typeof input.runtimeRoot!=='string'||!path.isAbsolute(input.runtimeRoot))throw Error('请选择模型目录');
                const root=path.resolve(input.runtimeRoot);
                try{if((await fs.readdir(root)).length&&!await storage.owned(root))throw Error('请选择空目录或已有的视频重建目录');}catch(e){if(e.code!=='ENOENT')throw e;}
                settings={...settings,runtimeRoot:root};await persistSettings();await checkReady();return snapshot();
            }
            throw Error('未知视频重建操作');
        },
        dispose(){disposed=true;aborter?.abort();if(job?.status==='running'){job.cancelled=true;try{sync.writeFileSync(job.cancelFile,'cancel');}catch{}}},
    };
}
module.exports={createReconstructionHost};
