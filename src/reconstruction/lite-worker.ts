import {automaticPeopleDetector} from './auto-people.ts';
import {Input,UrlSource,ALL_FORMATS,CanvasSink} from 'mediabunny';
import {LiteTracker,poseJoints,LITE_BONES} from './lite-pose.ts';
declare global {interface Window {liteTask:{send:(message:unknown)=>Promise<void>}}}
async function main(){
 const send=window.liteTask.send,config=await (await fetch('config')).json();
 // Downloaded, hash-verified optional runtime; never load code from model/user output.
 const {FilesetResolver,PoseLandmarker}=await import(/* @vite-ignore */ new URL('vision_bundle.mjs',location.href).href);
 const input=new Input({source:new UrlSource(new URL('video',location.href),{maxCacheSize:8*1024*1024}),formats:ALL_FORMATS});
 let model:any;
 try{
  const track=await input.getPrimaryVideoTrack();if(!track||!await track.canDecode())throw Error('无法解码此视频，请使用 MP4 或 WebM');
  const sourceDuration=await input.computeDuration(),start=config.start,end=Math.min(sourceDuration,config.seconds?start+config.seconds:sourceDuration),duration=end-start;
  if(duration<2/config.fps)throw Error('所选区间不足两帧');
  await send({type:'progress',message:'加载轻量模型',progress:3});
  const fileset=await FilesetResolver.forVisionTasks(new URL('.',location.href).href.replace(/\/$/,''));
  model=await PoseLandmarker.createFromOptions(fileset,{baseOptions:{modelAssetPath:new URL('pose_landmarker_lite.task',location.href).href,delegate:'CPU'},runningMode:'VIDEO',numPoses:2,outputSegmentationMasks:false});
  const detect=automaticPeopleDetector(model);
  const aspect=track.displayWidth/track.displayHeight,height=Math.round(640/aspect),sink=new CanvasSink(track,{width:640,height,fit:'fill',poolSize:2,decoderOptions:{hardwareAcceleration:'prefer-software'}});
  const canvas=document.createElement('canvas');canvas.width=640;canvas.height=height;const ctx=canvas.getContext('2d')!;
  const count=Math.ceil(duration*config.fps),timestamps=Array.from({length:count},(_,i)=>start+i/config.fps),tracker=new LiteTracker();
  let i=0,inferenceMs=0;const began=performance.now();
  for await(const frame of sink.canvasesAtTimestamps(timestamps)){
   if(!frame)throw Error('无法读取所选视频帧');
   ctx.drawImage(frame.canvas,0,0);const time=i/config.fps,before=performance.now(),result=await detect(canvas,time*1000);inferenceMs+=performance.now()-before;
   const raw={time,landmarks:result.landmarks,worldLandmarks:result.worldLandmarks},people=tracker.update(raw,aspect);
   // Retain at most two preview images per second; raw keypoints retain every analysed frame.
   const preview=i===0||i===count-1||i%Math.max(1,Math.round(config.fps/2))===0?{
    sequence:i+1,time,frameIndex:i,frameCount:count,aspect,source:canvas.toDataURL('image/jpeg',.7),parents:LITE_BONES.map(b=>b[1]),points:[],
    camera:{position:[0,1,7],target:[0,1,0],up:[0,1,0],fov:2*Math.atan(2/7)*180/Math.PI},
    actors:people.map(p=>({id:p.id,joints:poseJoints(p.world).map(j=>[j.x+p.root[0],j.y+p.root[1],j.z])})),
   }:undefined;
   await send({type:'frame',raw,preview});await send({type:'progress',message:`分析画面 ${i+1} / ${count}`,progress:5+85*(i+1)/count});i++;
  }
  if(i!==count)throw Error('视频读取提前结束');
  await send({type:'complete',analysis:{engine:'mediapipe',duration,analysisFps:config.fps,aspect,width:track.displayWidth,height:track.displayHeight,frameCount:i,inferenceSeconds:inferenceMs/1000,processingSeconds:(performance.now()-began)/1000,manualIntervention:false,postprocessing:'screen-space association; approximate placement; joint rotation fitting; fixed camera'}});
 }finally{model?.close();input.dispose();}
}
void main().catch(error=>window.liteTask.send({type:'error',error:String(error.message||error)}));
