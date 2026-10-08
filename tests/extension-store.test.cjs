const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createExtensionStore,readExtensionPackage}=require('../desktop/extensions/store.cjs');

test('installed plugins persist, failed updates preserve the current install, uninstall retains private data',async t=>{
    const root=await fs.mkdtemp(path.join(os.tmpdir(),'director-extensions-'));
    t.after(()=>fs.rm(root,{recursive:true,force:true}));
    const store=createExtensionStore(root),pkg=await readExtensionPackage(path.resolve('examples/plugins/curve-lab'));
    const file=path.join(root,'curve.ddplugin');await fs.writeFile(file,JSON.stringify(pkg));
    const first=await store.install(file);assert.equal(first.enabled,false);
    await assert.rejects(store.asset(first.id,first.digest,first.entry),/未启用/);
    await store.enable(first.id,true);
    assert.match((await store.asset(first.id,first.digest,first.entry)).toString(),/activate/);
    assert.equal((await createExtensionStore(root).info(first.id)).enabled,true);
    const data=await store.dataDirectory(first.id);await fs.writeFile(path.join(data,'result.json'),'{}');
    const bad={...pkg,files:{...pkg.files,'../escape.cjs':{encoding:'utf8',data:''}}};
    await fs.writeFile(file,JSON.stringify(bad));await assert.rejects(store.install(file),/路径/);
    assert.equal((await store.info(first.id)).digest,first.digest);
    pkg.version='2';await fs.writeFile(file,JSON.stringify(pkg));const next=await store.install(file);
    assert.notEqual(next.digest,first.digest);assert.equal(next.enabled,false);
    await store.enable(first.id,true);await assert.rejects(store.asset(first.id,first.digest,first.entry));
    await assert.rejects(store.asset(first.id,next.digest,'../installed.json'),/路径/);
    await assert.rejects(store.remove('../outside'),/标识/);
    await store.remove(first.id);assert.deepEqual(await store.list(),[]);
    assert.equal(await fs.readFile(path.join(data,'result.json'),'utf8'),'{}');
});
