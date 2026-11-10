import type { AppContext } from '../app-context.ts';
import { outputSize, getFrameCount } from '../model.ts';
import { PreviewCache, PREVIEW_CACHE_BYTES, previewRange, previewSignature, type PreviewFrames, type PreviewRange } from './preview-cache.ts';

interface Session { cache:PreviewCache; epoch:number; current?:PreviewFrames; signature?:{revision:number;pluginRevision:number;sceneId:string;project:unknown;value:Promise<string>}; }
const sessions=new WeakMap<AppContext,Session>();
function session(ctx:AppContext){let state=sessions.get(ctx);if(!state){state={cache:new PreviewCache(),epoch:0};sessions.set(ctx,state);}return state;}
export const previewCacheEpoch=(ctx:AppContext)=>session(ctx).epoch;
async function identity(ctx:AppContext){
    const state=session(ctx),sceneId=ctx.scenes.context.sceneId;
    const pluginRevision=ctx.engine.pluginHooks.revision;
    if(!state.signature||state.signature.revision!==ctx.revision||state.signature.sceneId!==sceneId||state.signature.project!==ctx.project||state.signature.pluginRevision!==pluginRevision){
        state.signature={revision:ctx.revision,pluginRevision,sceneId,project:ctx.project,value:previewSignature(ctx.project).then(value=>value+':'+pluginRevision)};
    }
    const request=state.signature,signature=await request.value;
    if(ctx.revision!==request.revision||ctx.project!==request.project||ctx.scenes.context.sceneId!==sceneId||ctx.engine.pluginHooks.revision!==request.pluginRevision)return identity(ctx);
    state.cache.invalidate(sceneId,signature);
    if(state.current&&(state.current.sceneId!==sceneId||state.current.signature!==signature))state.current=undefined;
    return {state,sceneId,signature};
}
export async function currentPreview(ctx:AppContext){return (await identity(ctx)).state.current;}
export function clearPreviewCache(ctx:AppContext){const state=session(ctx);state.cache.clear();state.current=undefined;state.epoch++;}
export async function previewCacheState(ctx:AppContext){
    const {state}=await identity(ctx),c=state.current;
    return {ready:!!c,bytes:state.cache.bytes,ranges:state.cache.count,...(c?{start:c.start,end:c.end,cameraId:c.cameraId,size:c.size,fps:c.fps,frames:c.frames.length}:{})};
}
/** Caller owns the busy lock. Generation is atomic; cancellation never publishes partial frames. */
export async function buildPreviewCache(ctx:AppContext,input:Partial<PreviewRange>,signal:AbortSignal,progress:(value:number)=>void){
    const range=previewRange(ctx.project,input),{state,sceneId,signature}=await identity(ctx);
    signal.throwIfAborted();const found=state.cache.find(sceneId,signature,range);
    if(found){state.current=found;progress(1);return {...await previewCacheState(ctx),reused:true};}
    const engine=ctx.engine;
    if(engine.exporting||engine.dragging||engine.drawingPath||engine.disposed)throw Error('请先结束当前编辑或导出操作');
    // Release old compressed frames before allocating a replacement; total retained frames stay bounded.
    clearPreviewCache(ctx);
    const original={time:engine.time,mono:engine.monochrome},project=ctx.project,revision=ctx.revision,pluginRevision=engine.pluginHooks.revision;
    const [width,height]=outputSize(project.aspect,range.size),total=getFrameCount(range.start,range.end,project.fps);
    const result:PreviewFrames={...range,sceneId,signature,fps:project.fps,width,height,frames:[],bytes:0};
    try{
        await engine.externalModels.prepare(project,signal);signal.throwIfAborted();
        engine.exporting=true;engine.monochrome=false;
        for(let i=0;i<total;i++){
            signal.throwIfAborted();const time=range.start+i/project.fps;
            await engine.prepareOutput(time,signal);signal.throwIfAborted();
            const canvas=engine.renderOutput(time,width,height,range.cameraId);
            const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('预览画面生成失败')),'image/jpeg',.86));
            signal.throwIfAborted();result.bytes+=blob.size;
            if(result.bytes>PREVIEW_CACHE_BYTES)throw Error('预览范围过大，请缩短范围或降低分辨率');
            result.frames.push(blob);progress((i+1)/total);await new Promise<void>(resolve=>setTimeout(resolve,0));
        }
        if(ctx.project!==project||ctx.revision!==revision||ctx.scenes.context.sceneId!==sceneId||engine.pluginHooks.revision!==pluginRevision)throw Error('场景已修改，请重新生成预览');
        signal.throwIfAborted();state.cache.put(result);state.current=result;state.epoch++;
        return {...await previewCacheState(ctx),reused:false};
    }finally{engine.monochrome=original.mono;engine.restorePreview(original.time);}
}
