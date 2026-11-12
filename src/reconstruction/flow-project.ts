import {applyFlowCamera} from './flow-camera.ts';
import fs from 'node:fs/promises';
import path from 'node:path';
import {entity,assertProject,ASPECTS,aspectNumber,type Project,type Vec3} from '../model.ts';
import {packModelFiles} from '../resources/model-package.ts';
import {modelPackageId} from '../resources/model-package-id.ts';
import {readSceneDocument} from '../scenes/sequence-project.ts';
import type {HumanBone,HumanoidRig} from '../resources/rig-definition.ts';

const BONES:HumanBone[]=['hips','leftUpperLeg','rightUpperLeg','spine','leftLowerLeg','rightLowerLeg','chest','leftFoot','rightFoot','upperChest','leftToes','rightToes','neck','leftShoulder','rightShoulder','head','leftUpperArm','rightUpperArm','leftLowerArm','rightLowerArm','leftHand','rightHand'];
export interface FlowPerson {id:number;start:number;end:number;parents:number[];rest:number[][];translations:number[][];rotations:number[][][]}
function vector(value:unknown,width:number):value is number[]{return Array.isArray(value)&&value.length===width&&value.every(v=>typeof v==='number'&&Number.isFinite(v));}
export function flowMotionResource(person:FlowPerson,fps:number){
    const {parents,rest,translations,rotations}=person;
    if(parents.length!==52||rest.length!==52||parents[0]!==-1||parents.some((p,i)=>!Number.isInteger(p)||i>0&&(p<0||p>=i))||!rest.every(v=>vector(v,3)))throw Error('FlowHMR 骨架无效');
    if(rotations.length<2||rotations.length>5000||translations.length!==rotations.length||!translations.every(v=>vector(v,3))||rotations.some(frame=>frame.length!==52||!frame.every(q=>vector(q,4)&&Math.abs(Math.hypot(...q)-1)<.01)))throw Error('FlowHMR 动作无效');
    const floor=Math.min(...[7,8,10,11].map(i=>rest[i][1]));
    const nodes=rest.map((r,i)=>({name:BONES[i]||`finger_${i}`,translation:i===0?[0,r[1]-floor,0]:r.map((v,a)=>v-rest[parents[i]][a]),children:[] as number[]}));
    parents.forEach((p,i)=>{if(p>=0)nodes[p].children.push(i);});
    const rig:HumanoidRig={version:1,family:'humanoid',bones:{}};
    function visit(i:number,p:string){if(BONES[i])rig.bones[BONES[i]]=p;nodes[i].children.forEach((child,j)=>visit(child,p+'/'+j));}visit(0,'0/0');
    const chunks:Buffer[]=[],views:any[]=[],accessors:any[]=[];let length=0;
    function array(values:number[],type:string,width:number){const bytes=Buffer.from(new Float32Array(values).buffer);views.push({buffer:0,byteOffset:length,byteLength:bytes.length});length+=bytes.length;chunks.push(bytes);accessors.push({bufferView:views.length-1,componentType:5126,count:values.length/width,type,...(type==='SCALAR'?{min:[values[0]],max:[values.at(-1)]}:{})});return accessors.length-1;}
    const times=Array.from({length:rotations.length},(_,i)=>person.start+i/fps);times.push(person.end);
    const input=array(times,'SCALAR',1),samplers:any[]=[],channels:any[]=[];
    function channel(node:number,property:string,data:number[],width:number){samplers.push({input,output:array(data,width===4?'VEC4':'VEC3',width),interpolation:'LINEAR'});channels.push({sampler:samplers.length-1,target:{node,path:property}});}
    for(let j=0;j<52;j++){
        let previous:number[]|undefined;
        const values=[...rotations,rotations.at(-1)!].flatMap(frame=>{let q=[...frame[j]];if(previous&&q.reduce((sum,v,i)=>sum+v*previous![i],0)<0)q=q.map(v=>-v);previous=q;return q;});
        channel(j,'rotation',values,4);
    }
    channel(0,'translation',[...translations,translations.at(-1)!].flatMap(v=>[0,v[1]+rest[0][1],0]),3);
    const doc={asset:{version:'2.0',generator:'DirectorDesk FlowHMR adapter'},scene:0,scenes:[{nodes:[0]}],nodes,skins:[{joints:nodes.map((_,i)=>i),skeleton:0}],buffers:[{byteLength:length,uri:'data:application/octet-stream;base64,'+Buffer.concat(chunks).toString('base64')}],bufferViews:views,accessors,animations:[{name:'识别动作',samplers,channels}]};
    return {rig,package:packModelFiles('motion.gltf',[{path:'motion.gltf',bytes:new TextEncoder().encode(JSON.stringify(doc))}])};
}
export async function buildFlowProject(directory:string,actorModel='human-adult'){
    const input=JSON.parse(await fs.readFile(path.join(directory,'flow-motion.json'),'utf8'));
    if(input.version!==1||input.fps!==30||!Number.isFinite(input.duration)||input.duration<=0||input.duration>5000/30||!Number.isFinite(input.aspect)||input.aspect<=0||!Array.isArray(input.people)||input.people.length<1)throw Error('FlowHMR 识别结果无效');
    const aspect=[...ASPECTS].sort((a,b)=>Math.abs(Math.log(aspectNumber(a)/input.aspect))-Math.abs(Math.log(aspectNumber(b)/input.aspect)))[0];
    const p:Project={format:'director-desk',version:2,name:'人物动作',duration:input.duration,fps:30,aspect,room:{enabled:false,width:10,depth:10,height:3},entities:[],cuts:[],references:[],resources:[]};
    let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
    const resourceIds=new Set<string>();
    for(const person of input.people as FlowPerson[]){
        if(!Number.isInteger(person.id)||person.id<0||!Number.isFinite(person.start)||!Number.isFinite(person.end)||person.start<0||person.end>p.duration+1/30||person.end<=person.start||Math.abs(person.end-person.start-person.rotations.length/30)>1e-5)throw Error('FlowHMR 人物时间范围无效');
        person.end=Math.min(person.end,p.duration);
        const motion=flowMotionResource(person,30),id=await modelPackageId(motion.package);
        if(!resourceIds.has(id)){p.resources!.push({id,name:`人物 ${person.id+1} 动作`,package:motion.package,source:'FlowHMR',license:'FlowHMR model weights: non-commercial educational, research and non-profit use',copyright:''});resourceIds.add(id);}
        const route=person.translations.map((v,i)=>({time:person.start+i/30,position:[v[0]+person.rest[0][0],0,v[2]+person.rest[0][2]] as Vec3}));
        for(const {position:[x,,z]} of route){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minZ=Math.min(minZ,z);maxZ=Math.max(maxZ,z);}
        const actor=entity('actor',actorModel==='source'?'human-adult':actorModel,`人物 ${person.id+1}`,route[0].position);actor.id='person-'+person.id;actor.face='fixed';actor.color=['#bcad92','#a8bcc9','#b3a2bf','#9cae99'][person.id%4];
        actor.path={smooth:false,points:route};actor.clips=[{id:actor.id+'-motion',name:'识别动作',action:'retarget',start:person.start,end:person.end,offset:person.start,speed:1,retarget:{resourceId:id,index:0,loop:false,unitScale:1,orientation:[0,0,0],rig:motion.rig}}];
        actor.visibility=[{id:actor.id+'-visible',start:person.start,end:person.end}];p.entities.push(actor);
    }
    const cx=(minX+maxX)/2,cz=(minZ+maxZ)/2;
    const distance=Math.max(6,(maxX-minX)*1.3,maxZ-minZ+4);
    const camera=entity('camera','camera','参考机位',[cx,2,cz+distance]);camera.id='recovered-camera';camera.camera!.target=[cx,1,cz];camera.camera!.focal=28;if(input.camera!==undefined)applyFlowCamera(camera,input.camera,p.duration);p.entities.push(camera);p.cuts=[{time:0,cameraId:camera.id}];
    assertProject(p);const file=path.join(directory,'reconstructed.director');await fs.writeFile(file,JSON.stringify(readSceneDocument(p)));
    await fs.writeFile(path.join(directory,'analysis.json'),JSON.stringify({duration:p.duration,inferenceSeconds:input.inferenceSeconds,frames:[]}));await fs.writeFile(path.join(directory,'scene.json'),JSON.stringify({objects:[]}));
    return {file,entities:p.entities.length,resources:p.resources!.length,validated:true};
}
