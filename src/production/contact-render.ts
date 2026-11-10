import type { Engine } from '../engine.ts';
import { Box3, type Mesh } from 'three';
import { outputSize, type Project } from '../model.ts';
import { sceneTargets } from '../spatial/scene-targets.ts';
import { frameBounds, geometryBounds } from '../spatial/geometry.ts';
import { sampleVisibility } from '../spatial/visibility.ts';
import { contactCardHtml, contactHtmlStart, contactShots, contactNotes, type ContactCard, type ContactShot } from './contact-sheet.ts';

/** Caller owns the busy lock. Holds just one rendered image at a time; always restores the editor. */
export async function renderContactShots(engine:Engine,project:Project,shots:ContactShot[],signal:AbortSignal,receive:(card:ContactCard)=>void|Promise<void>) {
    if(engine.exporting||engine.dragging||engine.drawingPath||engine.disposed)throw Error('请先结束当前编辑或导出操作');
    const original={project:engine.project,time:engine.time,preview:engine.previewId,selected:engine.selected,point:engine.selectedPoint};
    let changed=false;
    try{
        await engine.externalModels.prepare(project,signal);signal.throwIfAborted();
        if(project!==original.project){changed=true;engine.rebuild(project);}
        engine.exporting=true;
        const [width,height]=outputSize(project.aspect,640);
        for(const shot of shots){
            signal.throwIfAborted();await engine.prepareOutput(shot.time,signal);signal.throwIfAborted();
            const canvas=engine.renderOutput(shot.time,width,height,shot.cameraId,null);
            const image=canvas.toDataURL('image/jpeg',.85);
            const targets=sceneTargets(engine,shot.cameraId),camera=engine.getShotCamera(shot.cameraId),people=new Set<string>();
            const candidates=new Map<string,{name:string;meshes:Mesh[];bounds:Box3}>();
            for(const target of targets){
                if(!target.person)continue;
                const key=target.entityId??target.key,box=geometryBounds(target.root);if(!box)continue;
                let candidate=candidates.get(key);
                if(!candidate){candidate={name:project.entities.find(e=>e.id===key)?.name??target.name,meshes:[],bounds:new Box3()};candidates.set(key,candidate);}
                candidate.meshes.push(...target.meshes);candidate.bounds.union(box);
            }
            for(const target of candidates.values()){
                if(!frameBounds(target.bounds,camera).rectangle)continue;
                if(sampleVisibility(camera,target.meshes,targets,3).unblocked>0)people.add(target.name);
                await new Promise<void>(resolve=>setTimeout(resolve,0));signal.throwIfAborted();
            }
            signal.throwIfAborted();await receive({...shot,image,people:[...people],notes:contactNotes(project,shot)});
            // Yield between shots so cancellation and UI paint remain responsive.
            await new Promise<void>(resolve=>setTimeout(resolve,0));
        }
    }finally{
        engine.previewId=original.preview;
        try{if(changed)engine.rebuild(original.project);engine.select(original.selected,original.point);}
        finally{engine.restorePreview(original.time);}
    }
}
export async function contactSheetBlob(engine:Engine,project:Project,name:string,signal:AbortSignal,progress:(value:number)=>void=()=>{}){
    const shots=contactShots(project),parts:BlobPart[]=[contactHtmlStart(name,project.aspect)];let bytes=0;
    await renderContactShots(engine,project,shots,signal,card=>{
        const part=new Blob([contactCardHtml(card)]);bytes+=part.size;
        if(bytes>128*1024*1024)throw Error('联系表过大，请拆分戏段后导出');
        parts.push(part);progress((card.index+1)/shots.length);
    });
    signal.throwIfAborted();parts.push('</main></body></html>');return new Blob(parts,{type:'text/html;charset=utf-8'});
}
