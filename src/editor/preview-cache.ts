import type { Project } from '../model.ts';

export interface PreviewRange { start:number; end:number; size:640|1280; cameraId:string }
export interface PreviewFrames extends PreviewRange { sceneId:string; signature:string; fps:number; width:number; height:number; frames:Blob[]; bytes:number }
export const PREVIEW_CACHE_BYTES=64*1024*1024;
export const PREVIEW_CACHE_FRAMES=3600;
/** Compressed frames only; the viewer owns at most two decoded frames. Nothing is persisted. */
export class PreviewCache {
    private entries:PreviewFrames[]=[];
    get bytes(){return this.entries.reduce((sum,e)=>sum+e.bytes,0);}
    get count(){return this.entries.length;}
    clear(){this.entries=[];}
    invalidate(sceneId:string,signature:string){this.entries=this.entries.filter(e=>e.sceneId!==sceneId||e.signature===signature);}
    find(sceneId:string,signature:string,range:PreviewRange){
        this.invalidate(sceneId,signature);
        const found=this.entries.find(e=>e.sceneId===sceneId&&e.signature===signature&&e.start===range.start&&e.end===range.end&&e.size===range.size&&e.cameraId===range.cameraId);
        if(found){this.entries=this.entries.filter(e=>e!==found);this.entries.push(found);}return found;
    }
    put(entry:PreviewFrames){
        if(entry.bytes>PREVIEW_CACHE_BYTES||entry.frames.length>PREVIEW_CACHE_FRAMES)throw Error('预览范围过大，请缩短范围或降低分辨率');
        this.invalidate(entry.sceneId,entry.signature);
        this.entries=this.entries.filter(e=>!(e.sceneId===entry.sceneId&&e.start===entry.start&&e.end===entry.end&&e.size===entry.size&&e.cameraId===entry.cameraId));
        while(this.entries.length&&(this.bytes+entry.bytes>PREVIEW_CACHE_BYTES||this.entries.length>=8))this.entries.shift();
        this.entries.push(entry);
    }
}
/** Notes/selection/editor display options do not alter camera pixels. Unknown new fields stay included. */
export async function previewSignature(project:Project){
    const {production:_,references:__,editorView:___,creationMode:____,name:_____,...visual}=project;
    const bytes=new TextEncoder().encode(JSON.stringify(visual));
    const digest=await crypto.subtle.digest('SHA-256',bytes);
    return Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
}
export function previewRange(project:Project,input:Partial<PreviewRange>):PreviewRange{
    const start=input.start??0,end=input.end??project.duration,size=input.size??640,cameraId=input.cameraId??'program';
    if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>project.duration)throw Error('预览范围必须在戏段内，结束晚于开始');
    if(size!==640&&size!==1280)throw Error('预览分辨率仅支持 640 或 1280');
    if(cameraId!=='program'&&!project.entities.some(e=>e.id===cameraId&&e.kind==='camera'))throw Error('预览摄影机不存在');
    if(Math.ceil((end-start)*project.fps)>PREVIEW_CACHE_FRAMES)throw Error('预览范围过大，请缩短范围或降低分辨率');
    return {start,end,size,cameraId};
}
