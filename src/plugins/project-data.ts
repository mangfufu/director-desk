export type ExtensionData=Record<string,unknown>;
/** Opaque JSON belongs to the plugin. Preserve it even if the plugin is not installed. */
export function assertExtensionData(input:unknown):asserts input is ExtensionData {
    if(input===undefined)return;
    if(!input||typeof input!=='object'||Array.isArray(input))throw Error('插件工程数据无效');
    const seen=new Set<object>();let count=0;
    const visit=(v:unknown,depth:number)=>{
        if(++count>1000000||depth>64)throw Error('插件工程数据过大');
        if(v===null||typeof v==='string'||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v))return;
        if(typeof v!=='object'||!v||seen.has(v)||!Array.isArray(v)&&Object.getPrototypeOf(v)!==Object.prototype&&Object.getPrototypeOf(v)!==null)throw Error('插件工程数据必须是 JSON');
        seen.add(v);for(const item of Object.values(v))visit(item,depth+1);seen.delete(v);
    };
    for(const [id,value]of Object.entries(input)){if(!/^[a-z][a-z0-9-]{0,79}$/.test(id))throw Error('插件数据标识无效');visit(value,0);}
}
