const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {assertExtensionPackage,assertExtensionManifest,extensionId,extensionPath}=require('../../src/plugins/extension-package.ts');
function createExtensionStore(root){
    const folder=path.join(root,'extensions-v2');let queue=Promise.resolve();
    const serial=fn=>{const p=queue.then(fn);queue=p.catch(()=>{});return p;};
    const home=id=>{if(!extensionId(id))throw Error('插件标识无效');return path.join(folder,id);};
    async function info(id){const data=JSON.parse(await fs.readFile(path.join(home(id),'installed.json'),'utf8'));assertExtensionManifest(data);return {...data,entryUrl:`director://app/extensions/${id}/${data.digest}/${data.entry}`};}
    async function list(){await fs.mkdir(folder,{recursive:true});const rows=[];for(const d of await fs.readdir(folder,{withFileTypes:true})){if(!d.isDirectory()||!extensionId(d.name))continue;try{rows.push(await info(d.name));}catch{}}return rows;}
    return {list,info,home,
        install:source=>serial(async()=>{
            const pkg=await readExtensionPackage(source);assertExtensionPackage(pkg);
            const digest=createHash('sha256').update(JSON.stringify(pkg)).digest('hex'),directory=path.join(home(pkg.id),digest);
            const {files,...manifest}=pkg;await fs.mkdir(directory,{recursive:true});
            for(const [name,file]of Object.entries(files)){const target=path.join(directory,name);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,Buffer.from(file.data,file.encoding==='utf8'?'utf8':'base64'));}
            const metadata={...manifest,digest,enabled:false};await fs.writeFile(path.join(home(pkg.id),'installed.json.tmp'),JSON.stringify(metadata));await fs.rename(path.join(home(pkg.id),'installed.json.tmp'),path.join(home(pkg.id),'installed.json'));
            return info(pkg.id);
        }),
        enable:(id,enabled)=>serial(async()=>{if(typeof enabled!=='boolean')throw Error('启用状态无效');const value=await info(id);delete value.entryUrl;value.enabled=enabled;await fs.writeFile(path.join(home(id),'installed.json.tmp'),JSON.stringify(value));await fs.rename(path.join(home(id),'installed.json.tmp'),path.join(home(id),'installed.json'));return info(id);}),
        remove:id=>serial(async()=>{const target=home(id);if(path.dirname(target)!==folder)throw Error('插件路径无效');await fs.rm(target,{recursive:true,force:true});}),
        async asset(id,digest,relative){const entry=await info(id);extensionPath(relative);if(!entry.enabled||digest!==entry.digest)throw Error('插件未启用');return fs.readFile(path.join(home(id),digest,relative));},
        async dataDirectory(id){await info(id);const target=path.join(root,'extension-data',id);await fs.mkdir(target,{recursive:true});return target;},
    };
}
async function readExtensionPackage(source){
        if(typeof source!=='string'||!path.isAbsolute(source))throw Error('请选择插件文件或目录');
        const stat=await fs.lstat(source);if(stat.isSymbolicLink())throw Error('插件入口不能是文件链接');
        if(stat.isFile()){if(stat.size>512*1024*1024)throw Error('插件过大');return JSON.parse(await fs.readFile(source,'utf8'));}
        const manifest=JSON.parse(await fs.readFile(path.join(source,'plugin.json'),'utf8'));assertExtensionManifest(manifest);
        const files={};let size=0,count=0;
        async function walk(dir,prefix=''){for(const e of await fs.readdir(dir,{withFileTypes:true})){if(e.name==='.git')continue;const rel=prefix+e.name;extensionPath(rel);if(e.isSymbolicLink())throw Error('请将依赖打包为普通文件，不使用符号链接');if(e.isDirectory())await walk(path.join(dir,e.name),rel+'/');else if(e.isFile()){const stat=await fs.stat(path.join(dir,e.name));size+=stat.size;if(++count>20000||size>384*1024*1024)throw Error('插件过大');files[rel]={encoding:'base64',data:(await fs.readFile(path.join(dir,e.name))).toString('base64')};}}}
        await walk(source);return {...manifest,files};
}
module.exports={createExtensionStore,readExtensionPackage};
