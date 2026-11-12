import type {AppContext} from '../app-context.ts';
import {uid} from '../model.ts';
import {modelResourceId, type ModelResource} from '../resources/project-resources.ts';
import {mergeScene} from '../scenes/merge-project.ts';
import {addDocumentScene,readSceneDocument} from '../scenes/sequence-project.ts';
import {buildBlenderProject, type BlenderScene} from './blender-project.ts';

export async function blenderCall(action:string,data?:Record<string,unknown>) {
    const host=window.directorDesktop?.blender;
    if(!host)throw Error('请在桌面版中导入 Blender 工程');
    const result=await host(action,data);if(!result.ok)throw Error(result.error||'Blender 操作失败');return result.data;
}
export async function importBlender(ctx:AppContext,args:{path:string;mode?:'scene'|'open'|'merge';animations?:boolean;blenderPath?:string},signal:AbortSignal,check:()=>void,progress:(value:number)=>void=()=>{}) {
    const report=progress;let completed=0;progress=value=>report(completed=Math.max(completed,value));
    const id=uid(),cancel=()=>{void blenderCall('cancel',{id}).catch(()=>{});};
    signal.throwIfAborted();signal.addEventListener('abort',cancel,{once:true});
    let polling=false;
    const timer=setInterval(()=>{if(polling)return;polling=true;void blenderCall('state').then(s=>{if(s.job?.id===id)progress(s.job.progress*.7);}).catch(()=>{}).finally(()=>polling=false);},350);
    try {
        if(args.blenderPath)await blenderCall('configure',{path:args.blenderPath});
        signal.throwIfAborted();
        const scene:BlenderScene=await blenderCall('convert',{id,path:args.path,animations:args.animations!==false});
        signal.throwIfAborted();check();
        const resources:ModelResource[]=[];
        for(const [index,item] of scene.models.entries()){
            signal.throwIfAborted();item.package??=await blenderCall('model',{id,index});signal.throwIfAborted();
            resources.push({id:await modelResourceId(item.package,signal),name:item.name,package:item.package,copyright:'',license:'',source:'Blender'});
            progress(.7+.05*(index+1)/scene.models.length);
        }
        const stage={...ctx.project,version:2 as const,resources:[...(ctx.project.resources??[])]};
        for(const resource of resources)if(!stage.resources.some(r=>r.id===resource.id))stage.resources.push(resource);
        progress(.75);await ctx.engine.externalModels.prepare(stage,signal);signal.throwIfAborted();
        const built=buildBlenderProject(scene,resources.map(resource=>({resource,inspection:ctx.engine.externalModels.inspection(resource)})));
        progress(.9);const context=ctx.scenes.context;
        if(args.mode==='open') {
            const document=readSceneDocument(built.project);document.projectId=uid();
            await ctx.engine.externalModels.prepare(built.project,signal);signal.throwIfAborted();check();
            ctx.busy=false;try{ctx.applyDocument(document,context,'导入 Blender 工程',true);ctx.scenes.setFile();ctx.dirty=true;}finally{ctx.busy=true;}
            return {kind:'blender',mode:'open',name:scene.name,entityIds:built.project.entities.map(e=>e.id),warnings:built.warnings};
        }
        if(!args.mode||args.mode==='scene') {
            const document=addDocumentScene(ctx.scenes.document(),built.project,built.project.name);
            signal.throwIfAborted();check();
            ctx.busy=false;try{ctx.applyDocument(document,context,'导入 Blender 戏段');}finally{ctx.busy=true;}
            progress(1);return {kind:'blender',mode:'scene',sceneId:document.activeSceneId,name:scene.name,entityIds:built.project.entities.map(e=>e.id),warnings:built.warnings};
        }
        const merged=mergeScene(ctx.project,built.project,{offset:[0,0,0],timeOffset:0,scheduling:'keep',cuts:'keep'});
        if(!ctx.project.entities.some(e=>e.kind!=='camera')){
            merged.project.cuts=built.project.cuts.map(c=>({...c,cameraId:merged.entityIds[c.cameraId]}));
            merged.project.aspect=built.project.aspect;merged.project.fps=built.project.fps;
            if(built.project.lighting)merged.project.lighting=built.project.lighting;
        }
        await ctx.engine.externalModels.prepare(merged.project,signal);signal.throwIfAborted();check();
        ctx.busy=false;
        try{if(!ctx.change(()=>{ctx.project=merged.project;ctx.selected=merged.addedIds[0]??ctx.selected;ctx.sidebarTab='scene';}))throw Error('工程导入未提交');}finally{ctx.busy=true;}
        progress(1);return {kind:'blender',mode:'merge',name:scene.name,entityIds:merged.addedIds,warnings:[...built.warnings,...merged.warnings]};
    } catch(error) {signal.throwIfAborted();throw error;}
    finally {clearInterval(timer);signal.removeEventListener('abort',cancel);await blenderCall('release',{id}).catch(()=>{});ctx.engine.externalModels.retain([ctx.project,...ctx.history.undoStack,...ctx.history.redoStack]);}
}
