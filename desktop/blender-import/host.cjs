const fs=require('node:fs/promises');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {randomUUID}=require('node:crypto');
const {discover,blenderVersion}=require('./discovery.cjs');

function createBlenderHost({directory,script,readModelFiles,find=discover,version=blenderVersion,launch=spawn}) {
    let executable={path:'',version:''},active=null,latest=null,closed=false,prepared=null;
    const canceledIds=new Set();
    const config=path.join(directory,'settings.json'),jobs=path.resolve(directory,'jobs');
    const ready=(async()=>{let saved;try{saved=JSON.parse(await fs.readFile(config,'utf8')).path;}catch{}executable=await find(saved);})();
    const state=()=>({blender:{...executable},job:latest?{...latest}:null});
    async function release(id) {
        if(!prepared || id!==prepared.id)return;
        const directory=prepared.output;prepared=null;
        if(path.dirname(path.resolve(directory))===jobs)await fs.rm(directory,{recursive:true,force:true});
    }
    async function model(input) {
        const task=prepared;
        if(!task||input?.id!==task.id||!Number.isInteger(input.index)||input.index<0||input.index>=task.files.length)throw Error('转换资源已失效');
        const result=await readModelFiles(task.files[input.index]);
        if(prepared!==task||closed)throw Object.assign(Error('转换已取消'),{name:'AbortError'});
        return result;
    }
    async function configure(file) {
        await ready;if(active)throw Error('请先完成或取消当前转换');
        const info={path:file,version:await version(file)};
        if(active||closed)throw Error('请先完成或取消当前转换');
        await fs.mkdir(directory,{recursive:true});await fs.writeFile(config,JSON.stringify(info));executable=info;return state();
    }
    function kill(task) {
        if(!task?.child?.pid)return;
        if(process.platform==='win32') {const killer=spawn('taskkill.exe',['/pid',String(task.child.pid),'/t','/f'],{windowsHide:true,stdio:'ignore'});killer.on('error',()=>task.child.kill());}
        else task.child.kill('SIGKILL');
    }
    async function convert(input) {
        await ready;
        if(closed)throw Error('软件已关闭');
        if(active)throw Error('已有 Blender 转换正在进行');
        if(!executable.path)throw Error('未找到 Blender，请先选择安装位置');
        if(typeof input?.path!=='string'||!path.isAbsolute(input.path)||!/\.blend$/i.test(input.path)||!(await fs.stat(input.path)).isFile())throw Error('请选择有效的 .blend 工程');
        if(typeof input.id!=='string'||!input.id||input.id.length>200)throw Error('转换任务标识无效');
        if(active||closed)throw Error('已有 Blender 转换正在进行或软件已关闭');
        if(canceledIds.delete(input.id))throw Object.assign(Error('转换已取消'),{name:'AbortError'});
        const task={id:input.id,child:null,canceled:false};active=task;
        latest={id:task.id,status:'running',progress:0,stage:'reading',started:Date.now()};
        let output;
        try {
            if(prepared)await release(prepared.id);
            await fs.mkdir(jobs,{recursive:true});output=await fs.mkdtemp(path.join(jobs,'convert-'));
            await new Promise((resolve,reject)=>{
                let tail='',pending='';
                const child=task.child=launch(executable.path,['--background','--factory-startup','--disable-autoexec','--python-exit-code','1','--python',script,'--',input.path,output,input.animations===false?'static':'animated'],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,PYTHONUTF8:'1',PYTHONNOUSERSITE:'1'}});
                const outputText=data=>{const value=data.toString();tail=(tail+value).slice(-5000);pending+=value;const lines=pending.split(/\r?\n/);pending=lines.pop().slice(-10000);for(const line of lines){if(!line.startsWith('DIRECTOR_PROGRESS '))continue;try{const event=JSON.parse(line.slice(18));if(['reading','materials','models','cameras','lights','packing'].includes(event.stage)){latest.stage=event.stage;latest.progress=Math.max(latest.progress,Math.min(.9,Number(event.progress)||0));}}catch{}}};
                child.stdout.on('data',outputText);child.stderr.on('data',outputText);
                child.once('error',reject);child.once('close',code=>task.canceled?reject(Object.assign(Error('转换已取消'),{name:'AbortError'})):code===0?resolve():reject(Error('Blender 转换失败：'+tail.slice(-1800))));
                if(task.canceled)kill(task);
            });
            if(task.canceled||closed)throw Object.assign(Error('转换已取消'),{name:'AbortError'});
            const manifestPath=path.join(output,'scene.json');if((await fs.stat(manifestPath)).size>32*1024*1024)throw Error('场景信息过大');
            const manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
            if(manifest.version!==1||!Array.isArray(manifest.models)||manifest.models.length>10000)throw Error('Blender 转换结果无效');
            let total=0;latest.stage='packing';const files=[];
            for(const [index,model] of manifest.models.entries()) {
                if(task.canceled||closed)throw Object.assign(Error('转换已取消'),{name:'AbortError'});
                if(typeof model.file!=='string'||!/^model-\d+\.glb$/.test(model.file))throw Error('转换资源路径无效');
                const file=path.join(output,model.file),real=await fs.realpath(file);
                if(path.dirname(real)!==await fs.realpath(output))throw Error('转换资源超出任务目录');
                total+=(await fs.stat(real)).size;if(total>512*1024*1024)throw Error('转换后资源超过 512 MB，请拆分场景后导入');
                files.push(real);delete model.file;
                latest.progress=.9+.09*(index+1)/manifest.models.length;
            }
            prepared={id:task.id,output,files};output=undefined;
            latest.status='completed';latest.progress=1;latest.elapsedMs=Date.now()-latest.started;return manifest;
        } catch(error) {latest.status=task.canceled?'canceled':'failed';latest.error=error.message;throw error;}
        finally {
            // Only remove this host's generated task directory, never the source or its sidecars.
            if(output&&path.dirname(path.resolve(output))===jobs)await fs.rm(output,{recursive:true,force:true}).catch(()=>{});
            active=null;
        }
    }
    return {ready,state,configure,convert,model,release,isBusy:()=>!!active,cancel(id){if(active&&(!id||id===active.id)){active.canceled=true;kill(active);}else if(prepared&&(!id||id===prepared.id)){void release(prepared.id).catch(()=>{});if(latest)latest.status='canceled';}else if(typeof id==='string'){canceledIds.add(id);if(canceledIds.size>100)canceledIds.delete(canceledIds.values().next().value);}return state();},dispose(){closed=true;if(active){active.canceled=true;kill(active);}if(prepared)void release(prepared.id).catch(()=>{});}};
}
module.exports={createBlenderHost};
