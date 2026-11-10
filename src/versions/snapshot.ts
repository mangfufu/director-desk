import {assertSceneDocument,readSceneDocument,type SceneDocument} from '../scenes/sequence-project.ts';

export interface VersionInfo { id: string; projectId: string; name: string; created: number; scenes: number; sources: string[] }
export interface StoredVersion { info: VersionInfo; document: Omit<SceneDocument,'resources'|'media'>; resources: string[]; media: string[] }

export function validVersionName(name: string) {
    if(typeof name!=='string'||!name.trim()||name.length>200)throw Error('请输入版本名称（最多 200 字）');
}

/** Storage-independent snapshot; preserve the existing IndexedDB content addressing and document format. */
export async function packVersion(document: SceneDocument,name: string) {
    validVersionName(name);assertSceneDocument(document);
    if(!document.projectId)throw Error('工程缺少标识');
    const {resources,media=[],...state}=document,sources=new Map<string,unknown>();
    const hash=async(value:unknown)=>{
        const bytes=new TextEncoder().encode(JSON.stringify(value));
        const id=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
        sources.set(id,value);return id;
    };
    const resourceIds:string[]=[],mediaIds:string[]=[];
    for(const item of resources)resourceIds.push(await hash(item));
    for(const item of media)mediaIds.push(await hash(item));
    const info:VersionInfo={id:crypto.randomUUID(),projectId:document.projectId,name:name.trim(),created:Date.now(),scenes:document.scenes.length,sources:[...sources.keys()]};
    const item:StoredVersion={info,document:state,resources:resourceIds,media:mediaIds};
    return {item,sources};
}

export function unpackVersion(item:StoredVersion|undefined,sources:Map<string,unknown>,projectId:string):SceneDocument {
    if(!item||item.info.projectId!==projectId)throw Error('版本不存在或不属于当前工程');
    if(item.info.sources.some(key=>!sources.has(key)))throw Error('版本资源缺失');
    const document=readSceneDocument({...item.document,resources:item.resources.map(id=>sources.get(id)),...(item.media.length?{media:item.media.map(id=>sources.get(id))}:{})});
    if(document.projectId!==projectId)throw Error('版本不属于当前工程');
    return document;
}
