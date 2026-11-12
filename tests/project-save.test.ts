import test from 'node:test';
import assert from 'node:assert/strict';
import { saveProjectFile } from '../src/ui/project-save.ts';
import type { AppContext } from '../src/app-context.ts';
import { SceneWorkspace } from '../src/scenes/scene-workspace.ts';
import { demoProject } from '../src/model.ts';

function fileBridge(destination: () => Promise<unknown>, chunks: Uint8Array[] = []) {
    return async (action: string, data?: any) => {
        if (action === 'project-destination') return destination();
        if (action === 'automation-write-begin') return { ok: true, data: { id: 'write', path: data.path, filename: data.name } };
        if (action === 'automation-write-chunk') chunks.push(data.bytes.slice());
        return { ok: true, data: { saved: action === 'automation-write-close' } };
    };
}

test('an edit committed during disk I/O stays unsaved and prevents save-and-exit continuation', async () => {
    const w=Object.getOwnPropertyDescriptor(globalThis,'window'),d=Object.getOwnPropertyDescriptor(globalThis,'document');
    let finish!: (value:unknown)=>void;
    Object.defineProperty(globalThis,'window',{configurable:true,value:{directorDesktop:{files:fileBridge(()=>new Promise(resolve=>finish=resolve))}}});
    Object.defineProperty(globalThis,'document',{configurable:true,value:{querySelector:()=>null}});
    const project=demoProject(),scenes=new SceneWorkspace(project,()=>({time:0,selected:project.entities[0].id,preview:'program'}));
    let dirty=true;
    const ctx={project,scenes,history:scenes,busy:false,draft:null,playing:false,engine:{exporting:false},updateTimeUI(){},toast(){},
        get dirty(){return dirty;},set dirty(value:boolean){dirty=value;if(!value)scenes.markSaved();}} as unknown as AppContext;
    try {
        const saving=saveProjectFile(ctx);
        scenes.begin(project);project.entities[0].position[0]+=3;scenes.commit(project);
        finish({ok:true,data:{saved:true,path:'saved.director'}});
        assert.equal(await saving,false);assert.equal(ctx.dirty,true);assert.equal(scenes.dirty,true);
        assert.equal(scenes.filePath,'saved.director');assert.equal(ctx.busy,false);
        scenes.undo(project);assert.equal(scenes.dirty,false,'undo back to the written snapshot is clean');
    } finally {
        if(w)Object.defineProperty(globalThis,'window',w);else Reflect.deleteProperty(globalThis,'window');
        if(d)Object.defineProperty(globalThis,'document',d);else Reflect.deleteProperty(globalThis,'document');
    }
});

test('save marks clean only after confirmed disk success, keeping canceled/failed work dirty and blocking concurrent edits', async () => {
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window'), previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
    let complete: (v: unknown) => void = () => {};
    const states: string[] = [];
    const chunks: Uint8Array[] = [];
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { directorDesktop: { files: fileBridge(() => new Promise(resolve => complete = resolve), chunks) } } });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { querySelector: () => ({ textContent: '' }) } });
    const ctx = { dirty: true, busy: false, playing: true, draft: null, engine: { exporting: false }, history: { pending: null },
        scenes: { dirty:false, markSaved() {}, document: () => ({ name: '测试', scenes: [{ id: 'first' }, { id: 'second' }] }) }, updateTimeUI() {}, toast: (s: string) => states.push(s),
    } as unknown as AppContext;
    try {
        let saving = saveProjectFile(ctx); assert.equal(ctx.dirty, true); assert.equal(ctx.busy, true);
        assert.equal(await saveProjectFile(ctx), false);
        complete({ ok: true, data: { saved: false } }); assert.equal(await saving, false);
        assert.equal(ctx.dirty, true); assert.equal(ctx.busy, false);
        saving = saveProjectFile(ctx); complete({ ok: false, error: 'disk full' }); assert.equal(await saving, false);
        assert.equal(ctx.dirty, true); assert.equal(ctx.busy, false);
        saving = saveProjectFile(ctx); complete({ ok: true, data: { path: 'saved.director' } }); assert.equal(await saving, true);
        assert.deepEqual(JSON.parse(Buffer.concat(chunks).toString()), ctx.scenes.document());
        assert.equal(ctx.dirty, false); assert.equal(ctx.busy, false); assert.ok(states.includes('项目已保存'));
    } finally {
        if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow); else Reflect.deleteProperty(globalThis, 'window');
        if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument); else Reflect.deleteProperty(globalThis, 'document');
    }
});

test('browser download allows save-and-open continuation without claiming confirmed disk persistence', async () => {
    const w = Object.getOwnPropertyDescriptor(globalThis, 'window'), d = Object.getOwnPropertyDescriptor(globalThis, 'document');
    let clicks = 0;
    Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({click() { clicks++; }}) } });
    const originalTimeout = globalThis.setTimeout;
    // Do not leave download URL disposal timers alive in this unit test.
    globalThis.setTimeout = ((fn: () => void) => { fn(); return 0; }) as unknown as typeof setTimeout;
    const ctx = { dirty:true,busy:false,playing:false,draft:null,engine:{exporting:false},history:{pending:null},
        scenes:{document:()=>({name:'web',scenes:[]})},updateTimeUI(){},toast(){} } as unknown as AppContext;
    try { assert.equal(await saveProjectFile(ctx), true); assert.equal(clicks, 1); assert.equal(ctx.dirty, true); assert.equal(ctx.busy, false); }
    finally {
        globalThis.setTimeout = originalTimeout;
        if (w) Object.defineProperty(globalThis,'window',w); else Reflect.deleteProperty(globalThis,'window');
        if (d) Object.defineProperty(globalThis,'document',d); else Reflect.deleteProperty(globalThis,'document');
    }
});

test('a failed streamed write aborts the temporary file and never marks the project saved', async () => {
    const w=Object.getOwnPropertyDescriptor(globalThis,'window');
    const actions:string[]=[];let marked=false;
    Object.defineProperty(globalThis,'window',{configurable:true,value:{directorDesktop:{files:async(action:string)=>{
        actions.push(action);
        if(action==='project-destination')return {ok:true,data:{path:'save.director'}};
        if(action==='automation-write-begin')return {ok:true,data:{id:'write',path:'save.director',filename:'save.director'}};
        if(action==='automation-write-chunk')return {ok:false,error:'disk full'};
        return {ok:true,data:{}};
    }}}});
    const ctx={dirty:true,busy:false,draft:null,history:{pending:null},engine:{exporting:false},updateTimeUI(){},toast(){},
        scenes:{document:()=>({name:'save'}),markSaved(){marked=true;}}} as unknown as AppContext;
    try {
        assert.equal(await saveProjectFile(ctx),false);assert.equal(marked,false);assert.equal(ctx.dirty,true);
        assert.deepEqual(actions,['project-destination','automation-write-begin','automation-write-chunk','automation-write-abort']);
    }finally{if(w)Object.defineProperty(globalThis,'window',w);else Reflect.deleteProperty(globalThis,'window');}
});
