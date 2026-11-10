const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {EventEmitter}=require('node:events'),{PassThrough}=require('node:stream'),{createHash}=require('node:crypto');
const {createReconstructionHost}=require('../desktop/video-reconstruction/host.cjs');
const {downloadFile}=require('../desktop/video-reconstruction/download.cjs');
async function fixture(t){
    const base=path.resolve('tmp/video-to-project/tests');await fs.mkdir(base,{recursive:true});const dir=await fs.mkdtemp(path.join(base,'case-'));
    await fs.writeFile(path.join(dir,'Human3R-LICENSE.txt'),'Non-commercial test license');
    t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir;
}
function fakeSpawn(){const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();setTimeout(()=>child.emit('close',0),5);return child;}
async function settled(host){for(let n=0;n<200;n++){if(!host.isBusy())return host.state();await new Promise(r=>setTimeout(r,5));}throw Error('Task did not settle');}
test('license blocks downloads and conversion, cannot be accepted by automation, persists and invalidates when changed',async t=>{
    const dir=await fixture(t);let downloads=0;
    const options={directory:path.join(dir,'data'),assetsDirectory:dir,platform:'linux',arch:'x64',install:async()=>downloads++};
    let host=await createReconstructionHost(options);
    await assert.rejects(host.handle('download',{}),/LICENSE_REQUIRED/);
    await assert.rejects(host.handle('start',{path:'/missing'}),/LICENSE_REQUIRED/);
    await assert.rejects(host.handle('accept-license',{accepted:true,version:host.state().model.licenseVersion}),/用户/);
    await assert.rejects(host.handle('accept-license',{accepted:true,version:'old'},true),/用户/);
    assert.equal(downloads,0);
    await host.handle('accept-license',{accepted:true,version:host.state().model.licenseVersion},true);
    host=await createReconstructionHost(options);assert.equal(host.state().accepted,true);
    await fs.appendFile(path.join(dir,'Human3R-LICENSE.txt'),' changed');
    host=await createReconstructionHost(options);assert.equal(host.state().accepted,false);
});
test('download cancellation, retry and repeated request ID do not duplicate installation',async t=>{
    const dir=await fixture(t);let calls=0,blocking=true;
    const host=await createReconstructionHost({directory:path.join(dir,'data'),assetsDirectory:dir,platform:'linux',arch:'x64',
        install:async(_root,{signal})=>{calls++;if(blocking)await new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true});if(signal.aborted)reject(Error('aborted'));});}});
    await host.handle('accept-license',{accepted:true,version:host.state().model.licenseVersion},true);
    const first=await host.handle('download',{requestId:'one'});
    const metadata=JSON.parse(await fs.readFile(path.join(host.state().settings.runtimeRoot,'runs',first.job.id,'task.json'),'utf8'));
    assert.equal(metadata.status,'running');assert.equal(metadata.id,first.job.id);
    assert.equal((await host.handle('download',{requestId:'one'})).job.id,first.job.id);
    await assert.rejects(host.handle('download',{requestId:'two'}),/进行/);
    await new Promise(r=>setTimeout(r,25));await host.handle('cancel');
    assert.equal((await settled(host)).job.status,'cancelled');
    blocking=false;await host.handle('download',{requestId:'two'});assert.equal((await settled(host)).job.status,'completed');
    const count=calls;await host.handle('download',{requestId:'two'});assert.equal(calls,count);
    host.dispose();await assert.rejects(host.handle('download',{requestId:'three'}),/关闭/);
});

test('restart persists interrupted task metadata so explicit cleanup can reclaim raw frames',async t=>{
    const storage=require('../desktop/video-reconstruction/storage.cjs'),base=await fixture(t),root=path.join(base,'managed'),data=path.join(base,'data'),dir=path.join(root,'runs','crashed');
    await storage.initialize(root);await fs.mkdir(data);await fs.mkdir(path.join(dir,'frames'),{recursive:true});
    await fs.writeFile(path.join(data,'settings.json'),JSON.stringify({runtimeRoot:root}));
    await fs.writeFile(path.join(data,'last-job.json'),JSON.stringify({id:'crashed',kind:'convert',status:'running',directory:dir}));
    for(const [name,value]of Object.entries({'frame-00000.npz':'raw','frames/00000.jpg':'frame','person-0.glb':'model','reconstructed.director':'keep result','custom.glb':'keep user file'}))await fs.writeFile(path.join(dir,name),value);
    const options={directory:data,assetsDirectory:base,platform:'linux',arch:'x64'};
    const host=await createReconstructionHost(options);t.after(()=>host.dispose());
    assert.equal(host.state().job.status,'interrupted');
    assert.equal(JSON.parse(await fs.readFile(path.join(dir,'task.json'),'utf8')).status,'interrupted');
    const restarted=await createReconstructionHost(options);t.after(()=>restarted.dispose());
    assert.equal(restarted.state().job.status,'interrupted');await restarted.handle('clear-cache');
    for(const name of ['frame-00000.npz','frames','person-0.glb'])await assert.rejects(fs.access(path.join(dir,name)));
    for(const name of ['reconstructed.director','custom.glb'])await fs.access(path.join(dir,name));
});

test('restart preserves a completed receipt if the process stopped before updating last-job',async t=>{
    const storage=require('../desktop/video-reconstruction/storage.cjs'),base=await fixture(t),root=path.join(base,'managed'),data=path.join(base,'data'),dir=path.join(root,'runs','done');
    await storage.initialize(root);await fs.mkdir(data);await fs.mkdir(dir,{recursive:true});
    const task={id:'done',kind:'convert',status:'running',directory:dir};
    await fs.writeFile(path.join(data,'settings.json'),JSON.stringify({runtimeRoot:root}));
    await fs.writeFile(path.join(data,'last-job.json'),JSON.stringify(task));
    await fs.writeFile(path.join(dir,'task.json'),JSON.stringify({...task,status:'completed',file:path.join(dir,'reconstructed.director')}));
    await fs.writeFile(path.join(dir,'frame-00000.npz'),'raw');
    const host=await createReconstructionHost({directory:data,assetsDirectory:base,platform:'linux',arch:'x64'});t.after(()=>host.dispose());
    assert.equal(host.state().job.status,'completed');await host.handle('clear-cache');
    await fs.access(path.join(dir,'frame-00000.npz')); // No valid embedded result: preserve evidence.
});

test('failure to persist a new task does not leave the host permanently busy',async t=>{
    const base=await fixture(t),data=path.join(base,'data');let installs=0;
    const host=await createReconstructionHost({directory:data,assetsDirectory:base,platform:'linux',arch:'x64',install:async()=>installs++});t.after(()=>host.dispose());
    await host.handle('accept-license',{accepted:true,version:host.state().model.licenseVersion},true);
    const blocked=path.join(data,'last-job.json.tmp');await fs.mkdir(blocked);
    await assert.rejects(host.handle('download',{requestId:'failed-write'}));
    assert.equal(host.isBusy(),false);assert.equal(host.state().job.status,'failed');assert.equal(installs,0);
    await fs.rmdir(blocked);await host.handle('download',{requestId:'retry-write'});
    assert.equal((await settled(host)).job.status,'completed');assert.equal(installs,1);
});
test('downloads verify size/hash, remove partial failures, and reuse verified model',async t=>{
    const dir=await fixture(t),bytes=Buffer.from('model'),item={file:'models/model.pth',url:'https://example.test/model',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
    await assert.rejects(downloadFile(item,dir,{fetch:async()=>new Response('wrong')}),/校验/);
    await assert.rejects(fs.access(path.join(dir,item.file)));
    await assert.rejects(fs.access(path.join(dir,item.file+'.part')));
    await downloadFile(item,dir,{fetch:async()=>new Response(bytes)});
    await downloadFile(item,dir,{fetch:async()=>{throw Error('should reuse verified file');}});
    const controller=new AbortController();controller.abort();
    await assert.rejects(downloadFile({...item,file:'cancel.pth'},dir,{signal:controller.signal}));
});
test('managed native environment isolates Python and all large caches without changing PATH',()=>{
    const {environment,locations}=require('../desktop/video-reconstruction/runtime.cjs');
    const root=path.resolve('tmp/video-to-project/native-test'),env=environment(root,'win32');
    const pathKey=Object.keys(process.env).find(k=>k.toUpperCase()==='PATH');assert.ok(env[pathKey]===process.env[pathKey]);assert.equal(env.PYTHONHOME,undefined);assert.equal(env.PYTHONPATH,undefined);
    assert.equal(env.UV_PYTHON_INSTALL_REGISTRY,'false');assert.equal(env.UV_PYTHON_INSTALL_BIN,'false');
    assert.equal(env.UV_PYTHON_PREFERENCE,'only-managed');
    for(const key of ['TEMP','TMP','HF_HOME','TORCH_HOME','UV_CACHE_DIR','UV_PYTHON_INSTALL_DIR','PIP_CACHE_DIR','CUDA_CACHE_PATH','PYTHONPYCACHEPREFIX'])assert.ok(env[key].startsWith(root+path.sep),key);
    assert.ok(locations(root,'win32').python.endsWith(path.join('Scripts','python.exe')));
    assert.ok(locations(root,'linux').python.endsWith(path.join('bin','python')));
});

test('cancelling an in-progress transfer leaves no partial model',async t=>{
    const dir=await fixture(t),controller=new AbortController();let sent=false;
    const body=new ReadableStream({pull(stream){if(sent){controller.abort();stream.close();}else{sent=true;stream.enqueue(new Uint8Array([1,2,3]));}}});
    await assert.rejects(downloadFile({file:'partial.pth',url:'https://example.test/model',bytes:10},dir,{signal:controller.signal,fetch:async()=>new Response(body)}));
    await assert.rejects(fs.access(path.join(dir,'partial.pth.part')));
    await assert.rejects(fs.access(path.join(dir,'partial.pth')));
});
test('unsupported platform and failed bootstrap cannot mark a runtime ready',async t=>{
    const dir=await fixture(t),options={directory:path.join(dir,'data'),assetsDirectory:dir,arch:'x64'};
    const unsupported=await createReconstructionHost({...options,platform:'darwin'});assert.equal(unsupported.state().supported,false);
    await assert.rejects(unsupported.handle('download'),/Windows/);
    let downloads=0;
    const host=await createReconstructionHost({...options,platform:'linux',install:async()=>{throw Error('Python missing');}});
    await host.handle('accept-license',{accepted:true,version:host.state().model.licenseVersion},true);
    await host.handle('download',{requestId:'fail'});assert.equal((await settled(host)).job.status,'failed');
    assert.equal(downloads,0);assert.equal(host.state().ready,false);
});

test('storage cleanup preserves results and never deletes an unmanaged directory',async t=>{
    const storage=require('../desktop/video-reconstruction/storage.cjs'),dir=await fixture(t),root=path.join(dir,'runtime');
    await storage.initialize(root);
    for(const folder of ['cache','runtime','models','runs']){await fs.mkdir(path.join(root,folder));await fs.writeFile(path.join(root,folder,'keep'),'abc');}
    assert.equal((await storage.usage(root)).total,12);
    await storage.remove(root,'cache');await assert.rejects(fs.access(path.join(root,'cache')));
    await fs.access(path.join(root,'runtime','keep'));await storage.remove(root,'runtime');
    await fs.access(path.join(root,'runs','keep'));
    await assert.rejects(storage.remove(dir,'runtime'),/不是/);
    await assert.rejects(storage.initialize(dir),/已有/);
});

test('native subprocess preserves spaces and metacharacters as arguments and hides its window',async t=>{
    const dir=await fixture(t),{runProcess}=require('../desktop/video-reconstruction/runtime.cjs');let recorded;
    await runProcess('python.exe',['a & b.py','--input','D:/my file.mp4'],{root:dir,task:{directory:dir},platform:'win32',spawnProcess:(exe,args,opts)=>{recorded={exe,args,opts};return fakeSpawn();}});
    assert.deepEqual(recorded.args,['a & b.py','--input','D:/my file.mp4']);assert.equal(recorded.opts.shell,undefined);assert.equal(recorded.opts.windowsHide,true);
});

test('completed conversion releases raw frames and duplicate models only after verifying embedded bytes',async t=>{
    const storage=require('../desktop/video-reconstruction/storage.cjs'),{cleanRun}=require('../desktop/video-reconstruction/artifacts.cjs');
    const base=await fixture(t),root=path.join(base,'managed'),dir=path.join(root,'runs','completed');
    await storage.initialize(root);await fs.mkdir(path.join(dir,'frames'),{recursive:true});
    const write=(name,value)=>fs.writeFile(path.join(dir,name),typeof value==='string'?value:JSON.stringify(value));
    await write('task.json',{kind:'convert',status:'completed'});
    await write('scene.json',{objects:[{file:'person-0.glb'}]});await write('analysis.json',{frames:[{file:'frame-00000.npz'}]});
    await write('frame-00000.npz','raw');await write('frames/00000.jpg','frame');await write('person-0.glb','model');await write('custom.glb','user model');
    await write('preview.json','preview');await write('run.log','log');
    const doc={format:'director-desk',version:3,scenes:[{}],resources:[{package:{files:[{path:'person-0.glb',data:Buffer.from('wrong').toString('base64')}]}}]};
    await write('reconstructed.director',doc);
    await assert.rejects(cleanRun(root,dir),/不一致/);await fs.access(path.join(dir,'frame-00000.npz'));
    doc.resources[0].package.files[0].data=Buffer.from('model').toString('base64');await write('reconstructed.director',doc);
    assert.equal(await cleanRun(root,dir),13);assert.equal(await cleanRun(root,dir),0);
    for(const name of ['frame-00000.npz','frames','person-0.glb'])await assert.rejects(fs.access(path.join(dir,name)));
    for(const name of ['reconstructed.director','custom.glb','preview.json','run.log'])await fs.access(path.join(dir,name));
    await assert.rejects(cleanRun(root,base),/目录无效/);
});

test('cache cleanup releases finished and aborted intermediates but preserves active conversions',async t=>{
    const storage=require('../desktop/video-reconstruction/storage.cjs'),base=await fixture(t),root=path.join(base,'managed');
    await storage.initialize(root);
    for(const status of ['completed','failed','cancelled','running']){
        const dir=path.join(root,'runs',status);await fs.mkdir(dir,{recursive:true});
        for(const [name,value] of Object.entries({'task.json':{kind:'convert',status},'scene.json':{objects:[]},'analysis.json':{frames:[{file:'frame-00000.npz'}]},'reconstructed.director':{format:'director-desk',version:3,scenes:[{}],resources:[]}}))await fs.writeFile(path.join(dir,name),JSON.stringify(value));
        await fs.writeFile(path.join(dir,'frame-00000.npz'),'raw');
    }
    await storage.remove(root,'cache');
    await assert.rejects(fs.access(path.join(root,'runs/completed/frame-00000.npz')));
    for(const status of ['failed','cancelled'])await assert.rejects(fs.access(path.join(root,'runs',status,'frame-00000.npz')));
    await fs.access(path.join(root,'runs/running/frame-00000.npz'));
});

test('interrupted verified download resumes its partial file and checks the complete hash',async t=>{
    const dir=await fixture(t),data=Buffer.from('abcdefgh'),item={file:'resume.bin',url:'https://example.test/large',bytes:8,sha256:createHash('sha256').update(data).digest('hex')};
    await fs.writeFile(path.join(dir,'resume.bin.part'),data.subarray(0,3));
    await downloadFile(item,dir,{fetch:async(_url,options)=>{assert.equal(options.headers.Range,'bytes=3-');return new Response(data.subarray(3),{status:206,headers:{'content-range':'bytes 3-7/8'}});}});
    assert.deepEqual(await fs.readFile(path.join(dir,'resume.bin')),data);
});

test('preview only returns a newer frame for the current conversion and tolerates atomic-write gaps',async t=>{
    const dir=await fixture(t),data=path.join(dir,'data'),output=path.join(dir,'run');await fs.mkdir(data);await fs.mkdir(output);
    await fs.writeFile(path.join(data,'last-job.json'),JSON.stringify({id:'job',kind:'convert',status:'completed',directory:output}));
    const host=await createReconstructionHost({directory:data,assetsDirectory:dir});
    assert.equal(await host.handle('preview'),null);
    await fs.writeFile(path.join(output,'preview.json'),JSON.stringify({sequence:2,frameIndex:1,time:.2,actors:[]}));
    assert.equal((await host.handle('preview')).jobId,'job');
    assert.equal(await host.handle('preview',{jobId:'job',sequence:2}),null);
    assert.equal((await host.handle('preview',{jobId:'old',sequence:2})).sequence,2);
    await fs.mkdir(path.join(output,'previews'));
    await fs.writeFile(path.join(output,'previews.json'),JSON.stringify([{sequence:1,time:0}]));
    await fs.writeFile(path.join(output,'previews/1.json'),JSON.stringify({sequence:1,time:0,points:[],actors:[]}));
    assert.equal((await host.handle('preview',{frame:1})).sequence,1);
    await assert.rejects(host.handle('preview',{frame:'../preview'}),/不存在/);
    await assert.rejects(host.handle('preview',{frame:999}),/不存在/);
});

test('cancelling native work terminates its subprocess tree',async t=>{
    const dir=await fixture(t),{runProcess}=require('../desktop/video-reconstruction/runtime.cjs'),controller=new AbortController();let childPid;
    const script="const {spawn}=require('node:child_process');const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true});console.log(child.pid);setInterval(()=>{},1000);";
    await assert.rejects(runProcess(process.execPath,['-e',script],{root:dir,task:{directory:dir},signal:controller.signal,onLine:line=>{if(/^\d+$/.test(line)){childPid=Number(line);controller.abort();}}}),/取消/);
    assert.ok(childPid);let alive=true;
    for(let n=0;n<100;n++){try{process.kill(childPid,0);}catch{alive=false;break;}await new Promise(r=>setTimeout(r,10));}
    assert.equal(alive,false,'subprocess must stop too');
});

test('video preview exposes only the selected local video and forwards range requests',async t=>{
    const dir=await fixture(t),video=path.join(dir,'clip.mp4');await fs.writeFile(video,'video');
    const {createVideoSource}=require('../desktop/video-reconstruction/video-source.cjs');const source=createVideoSource();
    await assert.rejects(source.select(path.join(dir,'Human3R-LICENSE.txt')),/视频/);
    const selected=await source.select(video);assert.equal(selected.name,'clip.mp4');assert.ok(!selected.url.includes(dir));
    const response=await source.respond(new Request(selected.url,{headers:{Range:'bytes=1-3'}}));assert.equal(response.status,206);assert.equal(response.headers.get('content-range'),'bytes 1-3/5');assert.equal(await response.text(),'ide');
    assert.equal((await source.respond(new Request(selected.url,{headers:{Range:'bytes=99-100'}}))).status,416);
    const next=await source.select(video);assert.equal((await source.respond(new Request(selected.url))).status,404);
    source.clear();assert.equal((await source.respond(new Request(next.url))).status,404);
});

test('installation steps retain completed work and mark only active work failed or cancelled',()=>{
    const {beginStage,finishStages}=require('../desktop/video-reconstruction/install-progress.cjs');
    const task={};beginStage(task,'components');task.downloadedBytes=50;task.totalBytes=100;beginStage(task,'model');
    assert.equal(task.steps[0].status,'completed');assert.equal(task.steps[1].status,'running');assert.equal(task.downloadedBytes,undefined);
    finishStages(task,'failed');assert.equal(task.steps[0].status,'completed');assert.equal(task.steps[1].status,'failed');assert.equal(task.steps[2].status,'pending');
    const retry={};beginStage(retry,'components');finishStages(retry,'cancelled');assert.equal(retry.steps[0].status,'cancelled');
});

test('installation receipts survive newer conversion tasks and omit private task fields',async t=>{
    const dir=await fixture(t),{installationRecord,previousInstallation}=require('../desktop/video-reconstruction/installation-record.cjs');
    const installed={id:'install',kind:'download',status:'completed',startedAt:20,finishedAt:1020,elapsedSeconds:1,steps:[{id:'model',status:'completed'}],directory:'private',requestSignature:'private'};
    for(const [id,task] of Object.entries({old:{...installed,startedAt:10},current:installed,convert:{id:'convert',kind:'convert',status:'completed',startedAt:30},failed:{id:'failed',kind:'download',status:'failed',startedAt:40}})){await fs.mkdir(path.join(dir,'runs',id),{recursive:true});await fs.writeFile(path.join(dir,'runs',id,'task.json'),JSON.stringify(task));}
    const receipt=await previousInstallation(dir,{});assert.deepEqual(receipt,installationRecord(installed));assert.equal(receipt.directory,undefined);assert.equal(receipt.requestSignature,undefined);
    assert.deepEqual(await previousInstallation('/not-needed',{installation:receipt}),receipt);
});
