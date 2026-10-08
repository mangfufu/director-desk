import test from 'node:test';
import assert from 'node:assert/strict';
import {createScene} from '../src/scenes.ts';
import {assertProject,clone} from '../src/model.ts';
import {assertExtensionData} from '../src/plugins/project-data.ts';
import {extensionHost} from '../src/plugins/extension-host.ts';
import {PluginRenderHooks} from '../src/plugins/render-hooks.ts';
import {SceneSession} from '../src/scenes/sequence-session.ts';
import {duplicateDocumentScene,projectForScene} from '../src/scenes/sequence-project.ts';
import {applyOperations} from '../src/automation/edits.ts';
import type {AppContext} from '../src/app-context.ts';
import {createToolService} from '../src/automation/service.ts';

test('opaque plugin JSON survives independent scenes, save, undo and rejected edits',()=>{
    const project=createScene('blank');project.extensions={'unknown-plugin':{points:[[1,2]],flag:false}};
    const session=new SceneSession(project),token=session.begin();token.project.extensions!['unknown-plugin']={flag:true};session.commit(token);
    session.undo();assert.deepEqual(session.project().extensions,project.extensions);
    const doc=duplicateDocumentScene(JSON.parse(JSON.stringify(session.exportDocument())),'scene-main','Copy','copy');
    const copy=projectForScene(doc);(copy.extensions!['unknown-plugin'] as any).points[0][0]=999;
    assert.deepEqual(projectForScene(doc,'scene-main').extensions,project.extensions);
    const edited=applyOperations(project,[{operation:'project',patch:{extensions:{'other-plugin':{v:2}}}}]);
    assert.deepEqual(edited.extensions,{'other-plugin':{v:2}});assertProject(edited);
    for(const value of [NaN,()=>0,new Date(),{bad:undefined}])assert.throws(()=>assertExtensionData({'test-plugin':value}),/JSON/);
    const cycle:any={};cycle.self=cycle;assert.throws(()=>assertExtensionData({'test-plugin':cycle}),/JSON/);
});

test('SDK isolates transaction drafts, rolls back invalid data and cleans activation failures',async t=>{
    const oldWindow=globalThis.window;
    (globalThis as any).window={directorDesktop:{extensions:async()=>({ok:true,data:true})}};
    t.after(()=>{(globalThis as any).window=oldWindow;delete (globalThis as any).__pluginApi;});
    let revisions=0;
    const ctx={project:createScene('blank'),revision:0,time:0,history:{pending:null},
        engine:{exporting:false,pluginHooks:new PluginRenderHooks(),sample(){},render(){}},toast(){},
        change(this:AppContext,fn:()=>void){const before=clone(this.project);try{fn();assertProject(this.project);revisions++;return true;}catch{this.project=before;return false;}}
    } as unknown as AppContext;
    const host=extensionHost(ctx,async()=>({}));
    const entry=(code:string)=>'data:text/javascript,'+encodeURIComponent(code);
    const info={format:'director-plugin' as const,apiVersion:2 as const,id:'probe',name:'Probe',version:'1',permissions:['editor' as const],commands:[],enabled:true,digest:'test',entry:'index.js',entryUrl:entry('export function activate(api){globalThis.__pluginApi=api;api.render.onSample(()=>{});}')};
    await host.activate(info);const api=(globalThis as any).__pluginApi;
    const selections:string[]=[];api.events.on('selection',(id:string)=>selections.push(id));
    ctx.selected='first';host.poll();host.poll();ctx.selected='second';host.poll();assert.deepEqual(selections,['first','second']);
    assert.equal(ctx.engine.pluginHooks.samples.size,1);
    let retained:any;assert.equal(api.editor.transaction((draft:any)=>{retained=draft;draft.name='Valid';}),true);
    retained.name='Late mutation';assert.equal(ctx.project.name,'Valid');assert.equal(revisions,1);
    assert.equal(api.editor.transaction((draft:any)=>{draft.duration=-1;}),false);assert.equal(ctx.project.name,'Valid');
    assert.throws(()=>api.editor.transaction(async(draft:any)=>{await Promise.resolve();draft.name='Async mutation';}),/同步/);
    await Promise.resolve();assert.equal(ctx.project.name,'Valid');
    await host.stop('probe');assert.equal(ctx.engine.pluginHooks.samples.size,0);assert.throws(()=>api.project.set({}),/停用/);
    ctx.selected='third';host.poll();assert.deepEqual(selections,['first','second']);
    await assert.rejects(host.activate({...info,entryUrl:entry('export function activate(api){api.render.onSample(()=>{});throw Error("broken");}')}),/broken/);
    assert.equal(host.active.size,0);assert.equal(ctx.engine.pluginHooks.samples.size,0);
});

test('plugin tools return focused discovery and preserve every JSON input type through dispatch',async t=>{
    const oldWindow=globalThis.window;
    const info={format:'director-plugin',apiVersion:2,id:'echo-plugin',name:'Echo',version:'1',enabled:true,permissions:['editor'],
        digest:'test',entry:'index.js',entryUrl:'data:text/javascript,'+encodeURIComponent('export function activate(api){api.commands.register("echo",input=>input);}'),
        commands:[{id:'echo',label:'Echo',description:'Return input',inputSchema:{description:'schema detail '.repeat(400)}}]};
    (globalThis as any).window={directorDesktop:{extensions:async(args:any)=>({ok:true,data:args.action==='list'?[info]:info})}};
    const project=createScene('blank');
    const ctx={project,revision:0,time:0,preview:'program',selected:project.entities[0].id,history:{pending:null,undoStack:[],redoStack:[]},
        engine:{exporting:false,pluginHooks:new PluginRenderHooks(),sample(){},render(){},externalModels:{retain(){}}},toast(){},updateTimeUI(){}
    } as unknown as AppContext;
    const service=createToolService(ctx);
    t.after(async()=>{await extensionHost(ctx).stop(info.id);(globalThis as any).window=oldWindow;});
    const listed=await service.call('director_plugins',{action:'list'});assert.equal(listed.ok,true);
    const summary=listed.data.items[0];
    assert.equal(summary.name,info.name);assert.equal(summary.commands[0].label,'Echo');
    assert.equal('inputSchema' in summary.commands[0],false);assert.equal('entryUrl' in summary,false);assert.equal('digest' in summary,false);
    const detail=await service.call('director_plugins',{action:'read',id:info.id});assert.deepEqual(detail.data.commands[0].inputSchema,info.commands[0].inputSchema);
    assert.ok(JSON.stringify(listed.data).length<JSON.stringify(detail.data).length/10);
    const {revision}=(await service.call('director_read',{sections:[]})).data;
    for(const input of [null,[],['a',1],true,false,'text',0,3,{value:null}]){
        const result=await service.call('director_plugins',{action:'run',id:info.id,command:'echo',input,revision,requestId:crypto.randomUUID()});
        assert.equal(result.ok,true,result.error??'plugin dispatch failed');assert.deepEqual(result.data,input);
    }
    const omitted=await service.call('director_plugins',{action:'run',id:info.id,command:'echo',revision,requestId:crypto.randomUUID()});
    assert.equal(omitted.ok,true,omitted.error??'plugin dispatch failed');assert.deepEqual(omitted.data,{});
    assert.equal((await service.call('director_plugins',{action:'run',id:info.id,command:'echo',input:NaN,revision,requestId:crypto.randomUUID()})).ok,false);
});
