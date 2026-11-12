const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path');
const storage=require('../desktop/video-reconstruction/storage.cjs');
const {createReconstructionHost}=require('../desktop/video-reconstruction/host.cjs');
async function fixture(t){
    const base=path.resolve('tmp/reconstruction-storage-tests');await fs.mkdir(base,{recursive:true});
    const dir=await fs.mkdtemp(path.join(base,'case-')),root=path.join(dir,'managed');await storage.initialize(root);
    t.after(()=>fs.rm(dir,{recursive:true,force:true}));
    const write=async(name,text='data')=>{const file=path.join(root,name);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,text);};
    return {dir,root,write};
}
test('uninstall targets one engine, including interrupted downloads, and preserves results and unknown files',async t=>{
    for(const engine of ['mediapipe','human3r','flowhmr']){
        const {root,write}=await fixture(t);
        const lite=['runtime/lite/vision_bundle.mjs','models/pose_landmarker_lite.task','models/pose_landmarker_lite.task.part'];
        const standard=['runtime/win32-x64/env/python.exe','runtime/linux-x64/env/python','models/human3r_672S.pth','models/human3r_672S.pth.part','cache/uv/cached','ready.json'];
        const flow=['flowhmr/models/body_models/smplh/neutral/model.npz','flowhmr/models/weights','flowhmr/runtime/win32-x64/ready.json','flowhmr/cache/tmp/foo'];
        const preserved=['models/user.glb','runtime/other/engine','cache/other/keep','runs/result.director'];
        for(const file of [...lite,...standard,...flow,...preserved])await write(file);
        const before=await storage.usage(root,engine);assert.ok(before.models>0);assert.ok(before.runtime>0);
        await storage.remove(root,'runtime',engine);
        for(const file of engine==='mediapipe'?lite:engine==='flowhmr'?flow:standard)await assert.rejects(fs.access(path.join(root,file)),{code:'ENOENT'});
        for(const file of [...(engine==='mediapipe'?[...standard,...flow]:engine==='flowhmr'?[...lite,...standard]:[...lite,...flow]),...preserved])await fs.access(path.join(root,file));
        const after=await storage.usage(root,engine);assert.equal(after.models+after.runtime+after.cache,0);
    }
});
test('cache cleaning is scoped to task engine; old tasks are Human3R and active runs stay intact',async t=>{
    const {root,write}=await fixture(t);
    for(const [id,engine,status] of [['legacy',undefined,'failed'],['lite','mediapipe','failed'],['active','mediapipe','running']]){
        await write(`runs/${id}/task.json`,JSON.stringify({kind:'convert',engine,status}));
        await write(`runs/${id}/frame-00000.npz`);await write(`runs/${id}/reconstructed.director`);
    }
    await write('models/pose_landmarker_lite.task');await write('models/pose_landmarker_lite.task.part');await write('cache/uv/cached');
    const lite=await storage.usage(root,'mediapipe'),standard=await storage.usage(root,'human3r');assert.ok(lite.runs>standard.runs);
    await storage.remove(root,'cache','mediapipe');
    for(const f of ['runs/lite/frame-00000.npz','models/pose_landmarker_lite.task.part'])await assert.rejects(fs.access(path.join(root,f)),{code:'ENOENT'});
    for(const f of ['runs/legacy/frame-00000.npz','runs/active/frame-00000.npz','runs/lite/reconstructed.director','models/pose_landmarker_lite.task','cache/uv/cached'])await fs.access(path.join(root,f));
    await storage.remove(root,'cache','human3r');await assert.rejects(fs.access(path.join(root,'runs/legacy/frame-00000.npz')),{code:'ENOENT'});
    await fs.access(path.join(root,'runs/active/frame-00000.npz'));
});
test('scoped cleanup rejects unknown engines and linked parent directories before deleting files',async t=>{
    const {dir,root,write}=await fixture(t);await write('cache/uv/keep');
    const external=path.join(dir,'outside');await fs.mkdir(external);await fs.writeFile(path.join(external,'human3r_672S.pth'),'keep');
    await fs.symlink(external,path.join(root,'models'),process.platform==='win32'?'junction':'dir');
    await assert.rejects(storage.remove(root,'runtime','other'),/未知识别方式/);
    await assert.rejects(storage.remove(root,'runtime',''),/未知识别方式/);
    await assert.rejects(storage.remove(root,'runtime',false),/未知识别方式/);
    await assert.rejects(storage.remove(root,'runtime','human3r'),/包含链接/);
    await fs.access(path.join(root,'cache/uv/keep'));await fs.access(path.join(external,'human3r_672S.pth'));
});
test('host defaults cleanup to selected mode, explicit target leaves selection and other download status intact',async t=>{
    const {dir,root,write}=await fixture(t),data=path.join(dir,'profile');await fs.mkdir(data);
    await fs.writeFile(path.join(dir,'Human3R-LICENSE.txt'),'test');await fs.writeFile(path.join(dir,'FlowHMR-LICENSE.txt'),'test-flow');await fs.writeFile(path.join(data,'settings.json'),JSON.stringify({runtimeRoot:root,engine:'mediapipe'}));
    await fs.writeFile(path.join(data,'last-job.json'),JSON.stringify({id:'lite',kind:'download',engine:'mediapipe',status:'completed'}));
    await write('models/pose_landmarker_lite.task');await write('models/human3r_672S.pth');await write('runtime/win32-x64/python');
    const host=await createReconstructionHost({directory:data,assetsDirectory:dir,liteReady:async()=>fs.access(path.join(root,'models/pose_landmarker_lite.task')).then(()=>true,()=>false)});t.after(()=>host.dispose());
    assert.equal(host.state().ready,true);assert.equal((await host.handle('storage')).engine,'mediapipe');
    await host.handle('remove-runtime',{engine:'human3r'});
    assert.equal(host.state().engine,'mediapipe');assert.equal(host.state().ready,true);assert.equal(host.state().job.id,'lite');
    await host.handle('remove-runtime');assert.equal(host.state().ready,false);assert.equal(host.state().job,null);
    await assert.rejects(host.handle('storage',{engine:'typo'}),/未知识别方式/);
});
