const fs=require('node:fs/promises'),sync=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
async function digest(file,signal){
    const hash=createHash('sha256');
    for await(const chunk of sync.createReadStream(file)){signal?.throwIfAborted();hash.update(chunk);}
    return hash.digest('hex');
}
// Only the pinned catalog supplies URLs. A partial response is never promoted to a usable model.
async function downloadFile(item,root,{fetch:fetcher=fetch,signal,progress=()=>{},status=()=>{}}={}){
    const file=path.join(root,item.file),part=file+'.part';await fs.mkdir(path.dirname(file),{recursive:true});
    try{const stat=await fs.stat(file);status('校验已有文件');if(item.sha256&&(!item.bytes||stat.size===item.bytes)&&await digest(file,signal)===item.sha256){progress(stat.size,stat.size);return file;}}catch(e){if(e.code!=='ENOENT')throw e;}
    signal?.throwIfAborted();
    let offset=0;
    try{const stat=await fs.stat(part);if(item.bytes&&stat.size>0&&stat.size<item.bytes)offset=stat.size;}catch(e){if(e.code!=='ENOENT')throw e;}
    status('连接下载源');progress(offset,item.bytes||0);
    let response=await fetcher(item.url,{signal,...(offset?{headers:{Range:`bytes=${offset}-`}}:{})});
    if(offset&&(response.status!==206||response.headers.get('content-range')!==`bytes ${offset}-${item.bytes-1}/${item.bytes}`)){
        await response.body?.cancel();offset=0;response=await fetcher(item.url,{signal});
    }
    if(!response.ok||!response.body)throw Error(`下载失败（HTTP ${response.status}），请重试`);
    const expected=item.bytes||Number(response.headers.get('content-length'))||0;
    const hash=createHash('sha256');
    if(offset)for await(const chunk of sync.createReadStream(part)){signal?.throwIfAborted();hash.update(chunk);}
    status('正在下载');
    const handle=await fs.open(part,offset?'a':'w');let received=offset;
    try{
        for await(const chunk of response.body){signal?.throwIfAborted();await handle.writeFile(chunk);hash.update(chunk);received+=chunk.length;progress(received,expected);}
        if(expected&&received!==expected)throw Error('下载不完整，请重试');
        if(item.sha256&&hash.digest('hex')!==item.sha256)throw Error('模型校验失败，请重新下载');
        signal?.throwIfAborted();
    }catch(e){await handle.close();await fs.rm(part,{force:true});throw e;}
    await handle.close();await fs.rename(part,file);return file;
}
module.exports={downloadFile,digest};
