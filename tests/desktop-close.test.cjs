const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

test('background tasks prevent exit even when the renderer reports a saved project',()=>{
    const ipcMain=new EventEmitter();ipcMain.handle=()=>{};
    const window=new EventEmitter();window.webContents=new EventEmitter();window.webContents.session=new EventEmitter();
    const prompts=[],host={ready:Promise.resolve(),read:()=>({})};
    const electron={ipcMain,app:{getPath:()=>path.resolve('tmp')},dialog:{showMessageBoxSync:(_window,options)=>{prompts.push(options);return 0;}}};
    const module={exports:{}};
    const mocks={
        electron,'./language.cjs':{text:(_window,value)=>value},
        './file-host.cjs':{createFileHost:()=>host},
        './file-permissions.cjs':{installFilePermissions:()=>{}},
        './automation-files.cjs':{createAutomationFiles:()=>({close:async()=>{}})},
    };
    vm.runInNewContext(fs.readFileSync(path.resolve('desktop/files.cjs'),'utf8'),{module,require:name=>mocks[name]??require(name)});
    let busy=true,allowed=false;
    const files=module.exports.attachFiles(window,{isBusy:()=>busy});
    ipcMain.emit('director-close-state',{sender:window.webContents,senderFrame:{url:'director://app/'}},{busy:false,dirty:false});
    files.preventUnload({preventDefault(){allowed=true;}});
    assert.equal(allowed,false);
    assert.equal(prompts.at(-1).message,'请先完成或取消当前操作');
    busy=false;
    files.preventUnload({preventDefault(){allowed=true;}});
    assert.equal(prompts.at(-1).message,'确定要退出吗');
    assert.equal(allowed,true);
});
