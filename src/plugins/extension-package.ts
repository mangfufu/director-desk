export interface ExtensionCommand { id:string; label:string; description?:string; inputSchema?:Record<string,unknown> }
export interface ExtensionManifest {
    format:'director-plugin'; apiVersion:2; id:string; name:string; version:string; description?:string;
    entry:string; backend?:string; permissions:('editor'|'native'|'network')[]; commands:ExtensionCommand[];
}
export interface ExtensionPackage extends ExtensionManifest { files:Record<string,{encoding:'utf8'|'base64';data:string}> }
export interface ExtensionInfo extends ExtensionManifest { enabled:boolean; digest:string; entryUrl:string }
export type ExtensionSummary=Pick<ExtensionInfo,'id'|'name'|'version'|'description'|'permissions'|'enabled'> & {
    commands:Omit<ExtensionCommand,'inputSchema'>[];active:boolean;error?:string;
};
export const extensionId=(id:unknown):id is string=>typeof id==='string'&&/^[a-z][a-z0-9-]{0,79}$/.test(id);
export function extensionPath(path:unknown):asserts path is string {
    if(typeof path!=='string'||!path||path.length>240||/[\\:#?\x00-\x1f]/.test(path)||path.split('/').some(p=>!p||p==='.'||p==='..'||/[. ]$/.test(p)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)))throw Error('插件文件路径无效');
}
export function assertExtensionManifest(value:unknown):asserts value is ExtensionManifest {
    const p=value as ExtensionManifest;
    if(!p||p.format!=='director-plugin'||p.apiVersion!==2||!extensionId(p.id)||typeof p.name!=='string'||!p.name.trim()||p.name.length>100||typeof p.version!=='string'||!p.version||p.version.length>40
        ||!Array.isArray(p.permissions)||!p.permissions.includes('editor')||p.permissions.some(v=>!['editor','native','network'].includes(v))||!Array.isArray(p.commands)||p.commands.length>200)throw Error('插件清单无效');
    extensionPath(p.entry);if(p.backend!==undefined){extensionPath(p.backend);if(!p.permissions.includes('native'))throw Error('后台入口需要 native 权限');}
    if(p.description!==undefined&&(typeof p.description!=='string'||p.description.length>2000))throw Error('插件说明过长');
    const ids=new Set<string>();for(const c of p.commands){if(!c||!extensionId(c.id)||ids.has(c.id)||typeof c.label!=='string'||!c.label||c.label.length>100)throw Error('插件命令无效');ids.add(c.id);}
}
export function assertExtensionPackage(value:unknown):asserts value is ExtensionPackage {
    assertExtensionManifest(value);const p=value as ExtensionPackage;
    if(!p.files||typeof p.files!=='object'||Array.isArray(p.files)||Object.keys(p.files).length>20000)throw Error('插件文件列表无效');
    const paths=new Set<string>();let size=0;
    for(const [path,file]of Object.entries(p.files)){extensionPath(path);if(paths.has(path.toLowerCase()))throw Error('插件文件名重复');paths.add(path.toLowerCase());
        if(!file||!['utf8','base64'].includes(file.encoding)||typeof file.data!=='string'||file.encoding==='base64'&&!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.data))throw Error('插件文件编码无效');
        size+=file.data.length;if(size>512*1024*1024)throw Error('插件超过 512 MB');
    }
    if(!Object.hasOwn(p.files,p.entry)||p.backend&&!Object.hasOwn(p.files,p.backend))throw Error('插件入口不存在');
}
