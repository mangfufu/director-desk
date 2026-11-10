import fs from 'node:fs/promises';
import path from 'node:path';
import {entity,assertProject,ASPECTS,aspectNumber,type Project,type Vec3} from '../model.ts';
import {packModelFiles} from '../resources/model-package.ts';
import {modelPackageId} from '../resources/model-package-id.ts';
import {readSceneDocument} from '../scenes/sequence-project.ts';
import type {HumanBone,HumanoidRig} from '../resources/rig-definition.ts';
import {LiteTracker,LITE_BONES,poseRotations,type LiteFrame,type LitePerson} from './lite-pose.ts';
type Sample=LitePerson&{time:number};
export function motionResource(samples:Sample[],end:number){
 const nodes=LITE_BONES.map(([name,,translation])=>({name,translation:[...translation],children:[] as number[]}));
 LITE_BONES.forEach((b,i)=>{if(b[1]>=0)nodes[b[1]].children.push(i);});
 const rig:HumanoidRig={version:1,family:'humanoid',bones:{}};
 function visit(i:number,p:string){rig.bones[LITE_BONES[i][0] as HumanBone]=p;nodes[i].children.forEach((child,j)=>visit(child,p+'/'+j));}visit(0,'0/0');
 const chunks:Buffer[]=[],views:any[]=[],accessors:any[]=[];let length=0;
 function array(values:number[],type:string,width:number){const bytes=Buffer.from(new Float32Array(values).buffer);views.push({buffer:0,byteOffset:length,byteLength:bytes.length});length+=bytes.length;chunks.push(bytes);accessors.push({bufferView:views.length-1,componentType:5126,count:values.length/width,type,...(type==='SCALAR'?{min:[Math.min(...values)],max:[Math.max(...values)]}:{})});return accessors.length-1;}
 const frames=[...samples,{...samples.at(-1)!,time:end}],times=array(frames.map(f=>f.time),'SCALAR',1),rotations=frames.map(f=>poseRotations(f.world));
 const samplers:any[]=[],channels:any[]=[];
 function channel(node:number,property:string,data:number[],width:number){samplers.push({input:times,output:array(data,width===4?'VEC4':'VEC3',width),interpolation:'LINEAR'});channels.push({sampler:samplers.length-1,target:{node,path:property}});}
 for(let i=0;i<nodes.length;i++)channel(i,'rotation',rotations.flatMap(r=>r[i]),4);
 channel(0,'translation',frames.flatMap(f=>[0,f.root[1],0]),3);
 const doc={asset:{version:'2.0',generator:'DirectorDesk MediaPipe pose fitting'},scene:0,scenes:[{nodes:[0]}],nodes,skins:[{joints:nodes.map((_,i)=>i),skeleton:0}],buffers:[{byteLength:length,uri:'data:application/octet-stream;base64,'+Buffer.concat(chunks).toString('base64')}],bufferViews:views,accessors,animations:[{name:'识别动作',samplers,channels}]};
 return {rig,package:packModelFiles('motion.gltf',[{path:'motion.gltf',bytes:new TextEncoder().encode(JSON.stringify(doc))}])};
}
export async function buildLiteProject(directory:string,actorModel='human-adult'){
 const analysis=JSON.parse(await fs.readFile(path.join(directory,'lite-analysis.json'),'utf8'));
 const frames:LiteFrame[]=(await fs.readFile(path.join(directory,'lite-frames.jsonl'),'utf8')).trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
 const tracker=new LiteTracker(),people=new Map<number,Sample[]>();
 for(const frame of frames)for(const person of tracker.update(frame,analysis.aspect)){if(!people.has(person.id))people.set(person.id,[]);people.get(person.id)!.push({...person,time:frame.time});}
 const aspect=[...ASPECTS].sort((a,b)=>Math.abs(Math.log(aspectNumber(a)/analysis.aspect))-Math.abs(Math.log(aspectNumber(b)/analysis.aspect)))[0];
 const p:Project={format:'director-desk',version:2,name:'轻量动作',duration:analysis.duration,fps:24,aspect,room:{enabled:false,width:10,depth:10,height:3},entities:[],cuts:[],references:[],resources:[]};
 for(const [id,samples] of people){
  if(samples.length<2)continue;
  const end=Math.min(p.duration,samples.at(-1)!.time+1/analysis.analysisFps),motion=motionResource(samples,end),resourceId=await modelPackageId(motion.package);
  p.resources!.push({id:resourceId,name:`人物 ${id+1} 动作`,package:motion.package,source:'MediaPipe Pose Lite',license:'',copyright:''});
  const e=entity('actor',actorModel==='source'?'human-adult':actorModel,`人物 ${id+1}`,[samples[0].root[0],0,0]);e.id='person-'+id;e.face='fixed';e.color=['#bcad92','#a8bcc9','#b3a2bf','#9cae99'][id%4];
  e.path={smooth:false,points:samples.map(s=>({time:s.time,position:[s.root[0],0,0] as Vec3}))};
  e.clips=[{id:e.id+'-motion',name:'识别动作',action:'retarget',start:samples[0].time,end,offset:samples[0].time,speed:1,retarget:{resourceId,index:0,loop:false,unitScale:1,orientation:[0,0,0],rig:motion.rig}}];
  e.visibility=[];
  for(const s of samples){const last=e.visibility.at(-1);if(last&&s.time<=last.end+1e-5)last.end=Math.min(p.duration,s.time+1/analysis.analysisFps);else e.visibility.push({id:e.id+'-visible-'+e.visibility.length,start:s.time,end:Math.min(p.duration,s.time+1/analysis.analysisFps)});}
  p.entities.push(e);
 }
 if(!p.entities.length)throw Error('未识别到连续人物动作，请选择人物更清晰的视频');
 const camera=entity('camera','camera','固定参考机位',[0,1,7]);camera.id='recovered-camera';camera.camera!.target=[0,1,0];
 // Match a four-metre vertical view using the existing 36mm sensor convention.
 camera.camera!.focal=36*7/(4*Math.max(1,aspectNumber(p.aspect)));p.entities.push(camera);p.cuts=[{time:0,cameraId:camera.id}];
 assertProject(p);
 const file=path.join(directory,'reconstructed.director');await fs.writeFile(file,JSON.stringify(readSceneDocument(p)));
 await fs.writeFile(path.join(directory,'analysis.json'),JSON.stringify({...analysis,frames:[]}));await fs.writeFile(path.join(directory,'scene.json'),JSON.stringify({objects:[]}));
 return {file,entities:p.entities.length,resources:p.resources!.length,validated:true};
}
