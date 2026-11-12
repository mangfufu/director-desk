const fs=require('node:fs/promises'),sync=require('node:fs'),path=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const {MODEL,RUNTIME_VERSION}=require('./manifest.cjs');
const {reconstructionActorModel}=require('../../src/reconstruction/actor-model.ts');
const {assertAnalysisDuration}=require('../../src/reconstruction/interval.ts');
const {locations,runProcess,installRuntime}=require('./runtime.cjs');
const storage=require('./storage.cjs');
const {installationRecord,previousInstallation}=require('./installation-record.cjs');
const lite=require('./lite-runtime.cjs');
const flow=require('./flow-runtime.cjs');
const {conversionTiming}=require('./task-timing.cjs');
async function createReconstructionHost({directory,assetsDirectory,defaultRoot=path.join(directory,'runtime'),buildProject,fetch:fetcher=fetch,platform=process.platform,arch=process.arch,run:runCommand=runProcess,install:install=installRuntime,liteInstall=lite.install,liteReady=lite.ready,bundledLiteReady=lite.ready,liteRun=require('./lite-runner.cjs').runLite,flowInstall=flow.install,flowStatus=flow.status,flowRun=flow.run,flowImport=flow.importBody}){
    await fs.mkdir(directory,{recursive:true});
    const settingsFile=path.join(directory,'settings.json'),jobFile=path.join(directory,'last-job.json');
    const licenseText=await fs.readFile(path.join(assetsDirectory,'Human3R-LICENSE.txt'),'utf8');
    const licenseVersion=createHash('sha256').update(licenseText).digest('hex');
    let settings={runtimeRoot:defaultRoot,configVersion:2},job=null,disposed=false,ready=false,writing=false,running=false,aborter,installation=null,installationRoot;
    try{settings={...settings,...JSON.parse(await fs.readFile(settingsFile,'utf8'))};}catch(e){if(e.code!=='ENOENT')settings={runtimeRoot:defaultRoot,configVersion:2};}
    if(settings.engine===undefined&&settings.consent)settings.engine='human3r';
    if(settings.distribution!==undefined){settings.runtimeRoot=path.join(settings.runtimeRoot,'native-runtime');delete settings.distribution;}
    try{job=JSON.parse(await fs.readFile(jobFile,'utf8'));}catch{}
    const supported=['win32','linux'].includes(platform)&&arch==='x64';
    const engine=()=>['human3r','flowhmr'].includes(settings.engine)?settings.engine:'mediapipe';
    const flowLicense=await fs.readFile(path.join(assetsDirectory,'FlowHMR-LICENSE.txt'),'utf8');
    const flowLicenseVersion=createHash('sha256').update(flowLicense).digest('hex');
    const bundledLiteRoot=path.join(assetsDirectory,'lite');
    const bundledLite=await bundledLiteReady(bundledLiteRoot);
    let flowState={};
    const readiness={mediapipe:false,human3r:false,flowhmr:false};
    const models={mediapipe:lite.MODEL,human3r:{...MODEL,licenseVersion,licenseText},flowhmr:{...flow.MODEL,licenseVersion:flowLicenseVersion,licenseText:flowLicense}};
    const accepted=()=>engine()==='mediapipe'||(engine()==='flowhmr'?settings.flowConsent?.version===flowLicenseVersion:settings.consent?.version===licenseVersion);
    const busy=()=>writing||running||job?.status==='running';
    const persistSettings=async()=>{await fs.writeFile(settingsFile+'.tmp',JSON.stringify(settings));await fs.rename(settingsFile+'.tmp',settingsFile);};
    const writeJson=async(file,value)=>{await fs.writeFile(file+'.tmp',JSON.stringify(value));await fs.rename(file+'.tmp',file);};
    const persist=()=>writeJson(jobFile,job);
    const persistTask=task=>writeJson(path.join(task.directory,'task.json'),{...task,pipelineVersion:task.engine==='mediapipe'?'mediapipe-1.2.2-lite-1':task.engine==='flowhmr'?flow.VERSION:RUNTIME_VERSION,manualIntervention:false});
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
        let task=null;if(job){const {cancelFile,directory,requestSignature,...visible}=job;task={...visible,...conversionTiming(job)};}
        return {supported,engine:engine(),accepted:accepted(),ready,settings:{runtimeRoot:settings.runtimeRoot,engine:engine()},model:models[engine()],modes:{mediapipe:{model:models.mediapipe,ready:readiness.mediapipe,accepted:true,bundled:bundledLite},human3r:{model:models.human3r,ready:readiness.human3r,accepted:settings.consent?.version===licenseVersion},flowhmr:{...flowState,model:models.flowhmr,accepted:settings.flowConsent?.version===flowLicenseVersion}},job:task,installation};
    };
    async function checkReady(){
        flowState=await flowStatus(settings.runtimeRoot,platform);readiness.flowhmr=flowState.ready;
        ready=false;readiness.human3r=false;readiness.mediapipe=bundledLite||await liteReady(settings.runtimeRoot);
        if(installationRoot!==settings.runtimeRoot){installation=null;installationRoot=undefined;}
        try{
            const marker=JSON.parse(await fs.readFile(path.join(settings.runtimeRoot,'ready.json'),'utf8'));
            if(marker.version!==RUNTIME_VERSION||marker.modelHash!==MODEL.sha256)return;
            if(installationRoot!==settings.runtimeRoot){installation=await previousInstallation(settings.runtimeRoot,marker);installationRoot=settings.runtimeRoot;}
            const stat=await fs.stat(path.join(settings.runtimeRoot,'models/human3r_672S.pth'));if(stat.size!==MODEL.bytes)return;
            const local=locations(settings.runtimeRoot,platform);
            for(const file of [local.python,path.join(local.repos,'Human3R/demo.py'),path.join(local.repos,'dinov2/hubconf.py')])await fs.access(file);
            readiness.human3r=true;
        }catch{}finally{ready=readiness[engine()];}
    }
    await checkReady();
    function assertUsable(){if(disposed)throw Error('软件正在关闭');if(!supported)throw Error('此功能需要 Windows / Linux x64');}
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
                ready=false;readiness[task.engine]=false;
                await (task.engine==='mediapipe'?liteInstall:task.engine==='flowhmr'?flowInstall:install)(settings.runtimeRoot,{task,signal:aborter.signal,fetch:fetcher,platform,run:runCommand,assetsDirectory});
                if(task.cancelled)throw Error('已取消');
                if(task.engine==='human3r')await fs.writeFile(path.join(settings.runtimeRoot,'ready.json'),JSON.stringify({version:RUNTIME_VERSION,modelHash:MODEL.sha256}));
                if(task.engine==='flowhmr'){await checkReady();task.message=ready?'模型已就绪':'请导入人体文件';}
                else{ready=true;readiness[task.engine]=true;task.message='模型已就绪';}
            }else if(task.kind==='import-body'){
                task.message='导入人体文件';
                await flowImport(settings.runtimeRoot,task.input.path,{task,signal:aborter.signal,platform,assetsDirectory,run:runCommand});
                if(task.cancelled)throw Error('已取消');await checkReady();task.message='人体文件已导入';
            }else{
                task.message='准备模型';task.progress=5;
                if(task.engine==='mediapipe')await liteRun({root:bundledLite?bundledLiteRoot:settings.runtimeRoot,task,signal:aborter.signal,assetsDirectory});
                else if(task.engine==='flowhmr')await flowRun(settings.runtimeRoot,{task,signal:aborter.signal,platform,assetsDirectory,run:runCommand});
                else{
                await execute('run-inference.py',['--input',task.input.path,'--start',String(task.input.start),'--seconds',String(task.input.seconds),'--fps',String(task.input.fps),'--output',task.directory,'--scene',task.input.scene],task);
                if(task.cancelled)throw Error('已取消');task.message=task.input.scene==='none'?'生成人物':'生成场景';task.progress=83;
                await execute('convert-analysis.py',['--input',task.directory,'--scene',task.input.scene],task);
                }
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
                if(task.engine==='flowhmr'&&task.kind!=='convert')await checkReady();
                if(task.kind==='download'&&task.status==='completed'&&task.engine==='human3r'){installation=installationRecord(task);installationRoot=settings.runtimeRoot;await fs.writeFile(path.join(settings.runtimeRoot,'ready.json'),JSON.stringify({version:RUNTIME_VERSION,modelHash:MODEL.sha256,installation}));}
                await persistTask(task);
                if(['completed','cancelled'].includes(task.status))try{
                    if(task.kind==='convert')await require('./artifacts.cjs').cleanRun(settings.runtimeRoot,task.directory);
                    else if(task.status==='completed')await storage.remove(settings.runtimeRoot,'cache',task.engine);
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
                await checkReady();if(!ready)throw Error(engine()==='flowhmr'&&flowState.runtimeReady&&flowState.modelsReady?'请先导入人体文件':'请先下载模型');
                if(typeof input.path!=='string'||!path.isAbsolute(input.path))throw Error('请选择视频');
                const source=path.resolve(input.path);if(!(await fs.stat(source)).isFile())throw Error('请选择视频文件');
                values={path:source,start:input.start??0,seconds:input.seconds??10,fps:engine()==='flowhmr'?30:input.fps??6,scene:input.scene??'planes',actorModel:reconstructionActorModel(input.actorModel)};
                if(engine()!=='human3r'){
                    if(input.scene&&input.scene!=='none')throw Error('此识别方式仅支持人物');
                    values.scene='none';values.actorModel=values.actorModel==='source'?'human-adult':values.actorModel;
                }
                if(!Number.isFinite(values.start)||values.start<0||!Number.isFinite(values.seconds)||values.seconds<0||(engine()!=='flowhmr'&&(!Number.isFinite(values.fps)||values.fps<1||values.fps>24))||!['none','planes','mesh'].includes(values.scene))throw Error('时间范围或分析精度无效');
                if(engine()==='flowhmr'){values.fps=30;values.cameraMode=input.cameraMode??'moving';if(!['fixed','moving'].includes(values.cameraMode))throw Error('摄影机类型无效');}
                if(values.seconds!==0){if(engine()==='flowhmr'){if(values.seconds<.1||values.seconds>5000/30)throw Error('请选择 0.1–166 秒的视频区间');}else assertAnalysisDuration(values.seconds,values.fps);}
            }else if(kind==='import-body'){
                if(engine()!=='flowhmr')throw Error('请先选择 FlowHMR');
                await checkReady();if(!flowState.runtimeReady)throw Error('请先下载 FlowHMR 运行环境');
                if(typeof input.path!=='string'||!path.isAbsolute(input.path)||!await fs.stat(input.path).then(s=>s.isFile(),()=>false))throw Error('请选择人体文件');
                values={path:path.resolve(input.path)};
            }
            await storage.initialize(settings.runtimeRoot);
            const id=randomUUID(),output=path.join(settings.runtimeRoot,'runs',id);await fs.mkdir(output,{recursive:true});await fs.mkdir(path.join(settings.runtimeRoot,'cache/tmp'),{recursive:true});
            job={id,kind,engine:engine(),status:'running',message:'准备中',progress:0,startedAt:Date.now(),directory:output,cancelFile:path.join(output,'.cancel'),input:values,cancelled:false,requestId:input.requestId,requestSignature:JSON.stringify(input)};
            started=job;
            await persist();await persistTask(job);running=true;const task=job;void run(task).catch(error=>{task.status='failed';task.message=error.message;running=false;});return snapshot();
        }catch(error){
            if(['EACCES','EPERM','EROFS'].includes(error.code))error.message='无法写入存储位置，请在视频反推设置中选择可写文件夹';
            if(started){started.status='failed';started.message=error.message;await persistTask(started).catch(()=>{});await persist().catch(()=>{});}
            throw error;
        }finally{writing=false;}
    }
    return {
        state:snapshot,isBusy:busy,
        async handle(action,input={},userGesture=false){
            if(action==='state')return snapshot();
            if(action==='storage'){const selected=input.engine??engine(),usage=await storage.usage(settings.runtimeRoot,selected);return {...usage,bundledBytes:selected==='mediapipe'&&bundledLite?lite.FILES.reduce((sum,item)=>sum+item.bytes,0):0};}
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
            if(action==='download'){if(engine()==='mediapipe'&&bundledLite){assertUsable();return snapshot();}return begin('download',input);}
            if(action==='start')return begin('convert',input);
            if(action==='import-body')return begin('import-body',input);
            if(action==='cancel'){if(job?.status==='running'){job.cancelled=true;job.message='正在取消';aborter?.abort();await fs.writeFile(job.cancelFile,'cancel');}return snapshot();}
            if(action==='result'){if(job?.status!=='completed'||!job.file)throw Error('还没有完成的工程');await fs.access(job.file);return {path:job.file};}
            if(busy())throw Error('请先结束当前任务');
            assertUsable();
            if(action==='clear-cache'||action==='remove-runtime'){
                const selected=input.engine??engine();
                writing=true;try{await storage.remove(settings.runtimeRoot,action==='clear-cache'?'cache':'runtime',selected);if(action==='remove-runtime'&&selected==='human3r'){installation=null;installationRoot=undefined;}await checkReady();if(action==='remove-runtime'&&job?.kind==='download'&&(job.engine||'human3r')===selected){job=null;await persist();}return snapshot();}finally{writing=false;}
            }
            if(action==='accept-license'){
                if(!userGesture||input.version!==models[engine()].licenseVersion||input.accepted!==true)throw Error('请由用户在界面确认当前模型许可');
                settings[engine()==='flowhmr'?'flowConsent':'consent']={version:models[engine()].licenseVersion,acceptedAt:new Date().toISOString()};await persistSettings();return snapshot();
            }
            if(action==='configure'){
                if(input.engine!==undefined){
                    if(!['human3r','mediapipe','flowhmr'].includes(input.engine))throw Error('未知识别方式');
                    if(input.runtimeRoot===undefined){settings={...settings,engine:input.engine};await persistSettings();await checkReady();return snapshot();}
                }
                if(typeof input.runtimeRoot!=='string'||!path.isAbsolute(input.runtimeRoot))throw Error('请选择模型目录');
                const root=path.resolve(input.runtimeRoot);
                try{if((await fs.readdir(root)).length&&!await storage.owned(root))throw Error('请选择空目录或已有的视频重建目录');}catch(e){if(e.code!=='ENOENT')throw e;}
                settings={...settings,runtimeRoot:root,...(input.engine?{engine:input.engine}:{})};await persistSettings();await checkReady();return snapshot();
            }
            throw Error('未知视频重建操作');
        },
        dispose(){disposed=true;aborter?.abort();if(job?.status==='running'){job.cancelled=true;try{sync.writeFileSync(job.cancelFile,'cancel');}catch{}}},
    };
}
module.exports={createReconstructionHost};
