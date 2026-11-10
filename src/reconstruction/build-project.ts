import fs from 'node:fs/promises';
import path from 'node:path';
import {entity,assertProject,type Project} from '../model.ts';
import {packModelFiles} from '../resources/model-package.ts';
import {modelPackageId} from '../resources/model-package-id.ts';
import {readSceneDocument} from '../scenes/sequence-project.ts';
import {replaceActor} from '../resources/replace-actor.ts';
import {reconstructionActorModel} from './actor-model.ts';
export async function buildProject(directory:string,options:{actorModel?:string}={}){
const actorModel=reconstructionActorModel(options.actorModel);
const dir=path.resolve(directory);
if(await fs.access(path.join(dir,'lite-analysis.json')).then(()=>true,()=>false))return (await import('./lite-project.ts')).buildLiteProject(dir,actorModel);
const scene=JSON.parse(await fs.readFile(path.join(dir,'scene.json'),'utf8'));
const project:Project={format:'director-desk',version:2,name:scene.name||'视频重建',duration:scene.duration,fps:24,aspect:scene.aspect,
    room:{enabled:false,width:10,depth:10,height:3},entities:[],cuts:[],references:[],resources:[]};
for(const obj of scene.objects){
    const bytes=new Uint8Array(await fs.readFile(path.join(dir,obj.file)));
    const data=packModelFiles(obj.file,[{path:obj.file,bytes}]),id=await modelPackageId(data);
    project.resources!.push({id,name:obj.name,package:data,copyright:'',source:'Human3R reconstruction',license:'Generated with Human3R; see source model license'});
    const e=entity(obj.kind,'external-model',obj.name,obj.position);e.id=obj.id;
    e.external={resourceId:id,appearance:'color',unitScale:1,orientation:[0,0,0],...(obj.rig?{rig:obj.rig}:{})};
    e.color=obj.kind==='actor'?['#bcad92','#a8bcc9','#b3a2bf'][Number(obj.id.split('-').pop())%3]:'#787878';
    e.face='fixed';e.path=obj.path??null;
    if(obj.kind==='actor'){
        e.clips=[{id:obj.id+'-motion',action:'native',start:obj.start,end:obj.end,speed:1,native:{index:0,loop:false}}];
        e.visibility=(obj.visibility??[{start:obj.start,end:obj.end}]).map((v:any,i:number)=>({id:obj.id+'-visible-'+i,...v}));
    }
    project.entities.push(e);
}
const c=entity('camera','camera','恢复摄影机',scene.cameras[0].position);c.id='recovered-camera';
c.path={smooth:false,points:scene.cameras.map((k:any)=>({time:k.time,position:k.position}))};
c.camera!.target=scene.cameras[0].target;
c.camera!.targetPath={smooth:false,points:scene.cameras.map((k:any)=>({time:k.time,position:k.target}))};
c.camera!.focal=scene.cameras[0].focal;
c.camera!.effects={channels:{focal:{keys:scene.cameras.map((k:any)=>({time:k.time,value:k.focal,easing:'linear'}))},roll:{keys:scene.cameras.map((k:any)=>({time:k.time,value:k.roll,easing:'linear'}))}}};
project.entities.push(c);project.cuts=[{time:0,cameraId:c.id}];
if(actorModel!=='source')for(const actor of project.entities)if(actor.kind==='actor')replaceActor(project,actor.id,actorModel);
assertProject(project);
const document=readSceneDocument(project);
await fs.writeFile(path.join(dir,'reconstructed.director'),JSON.stringify(document));
return {file:path.join(dir,'reconstructed.director'),entities:project.entities.length,resources:project.resources!.length,validated:true};
}
