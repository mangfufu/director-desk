const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
const {createBlenderHost}=require('../desktop/blender-import/host.cjs');

async function fixture(t,options={}){
    const base=path.resolve('tmp/blender-import/tests');await fs.mkdir(base,{recursive:true});const dir=await fs.mkdtemp(path.join(base,'case-'));
    t.after(()=>fs.rm(dir,{recursive:true,force:true}));const source=path.join(dir,'source.blend');await fs.writeFile(source,'original');
    let child,command;
    const host=createBlenderHost({directory:path.join(dir,'data'),script:path.join(dir,'export-scene.py'),find:async()=>({path:path.join(dir,'blender.exe'),version:'Blender 5.2.3'}),version:async()=>'Blender 5.2.3',readModelFiles:async file=>({file:path.basename(file)}),
        launch(exe,args,settings){command={exe,args,settings};child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();
            setTimeout(async()=>{const output=args.at(-2);await fs.writeFile(path.join(output,'model-0.glb'),'asset');await fs.writeFile(path.join(output,'scene.json'),JSON.stringify({version:1,models:[{file:options.traversal?'../source.blend':'model-0.glb'}]}));child.stdout.write('DIRECTOR_PROGRESS {"stage":"models","progress":0.5}\n');child.emit('close',options.fail?1:0);},20);return child;}});
    await host.ready;t.after(()=>host.dispose());return {host,source,dir,get command(){return command;}};
}
test('hidden Blender conversion disables source scripts, keeps input unchanged, and cleans only generated files',async t=>{
    const f=await fixture(t),result=await f.host.convert({id:'a',path:f.source});
    assert.equal(f.command.settings.windowsHide,true);assert.ok(f.command.args.includes('--disable-autoexec'));assert.ok(f.command.args.includes('--factory-startup'));
    assert.equal(result.models[0].package,undefined);assert.equal((await f.host.model({id:'a',index:0})).file,'model-0.glb');assert.equal(await fs.readFile(f.source,'utf8'),'original');
    await assert.rejects(f.host.model({id:'other',index:0}),/失效/);await assert.rejects(f.host.model({id:'a',index:-1}),/失效/);
    await f.host.release('a');await assert.rejects(f.host.model({id:'a',index:0}),/失效/);
    assert.deepEqual(await fs.readdir(path.join(f.dir,'data/jobs')),[]);assert.equal(f.host.state().job.status,'completed');
});
test('failed conversions clean intermediates and unlock the next attempt',async t=>{
    const f=await fixture(t,{fail:true});await assert.rejects(f.host.convert({id:'a',path:f.source}),/Blender 转换失败/);
    assert.equal(f.host.isBusy(),false);assert.deepEqual(await fs.readdir(path.join(f.dir,'data/jobs')),[]);
});
test('cancel before process start and during export never reports success',async t=>{
    const f=await fixture(t);f.host.cancel('early');await assert.rejects(f.host.convert({id:'early',path:f.source}),/取消/);
    const run=f.host.convert({id:'later',path:f.source});while(!f.host.isBusy())await new Promise(r=>setTimeout(r,1));f.host.cancel('later');
    await assert.rejects(run,/取消/);assert.equal(f.host.state().job.status,'canceled');assert.deepEqual(await fs.readdir(path.join(f.dir,'data/jobs')),[]);
});
test('conversion output cannot read assets outside its task directory',async t=>{
    const f=await fixture(t,{traversal:true});await assert.rejects(f.host.convert({id:'a',path:f.source}),/资源路径/);assert.equal(await fs.readFile(f.source,'utf8'),'original');
});
test('cancel after conversion releases staged assets; a later conversion replaces abandoned assets',async t=>{
    const f=await fixture(t);await f.host.convert({id:'a',path:f.source});
    await f.host.convert({id:'b',path:f.source});
    await assert.rejects(f.host.model({id:'a',index:0}),/失效/);
    assert.equal((await fs.readdir(path.join(f.dir,'data/jobs'))).length,1);
    f.host.cancel('b');await assert.rejects(f.host.model({id:'b',index:0}),/失效/);
    for(let i=0;i<50&&(await fs.readdir(path.join(f.dir,'data/jobs'))).length;i++)await new Promise(r=>setTimeout(r,10));
    assert.deepEqual(await fs.readdir(path.join(f.dir,'data/jobs')),[]);
});
