const fs=require('node:fs/promises'),{createReadStream}=require('node:fs'),{Readable}=require('node:stream'),path=require('node:path'),{randomUUID}=require('node:crypto');
function createVideoSource(){
    let current;
    return {
        async select(file){
            if(typeof file!=='string'||!path.isAbsolute(file)||!['.mp4','.mov','.mkv','.avi','.webm','.m4v'].includes(path.extname(file).toLowerCase())||!(await fs.stat(file)).isFile())throw Error('请选择视频文件');
            current={id:randomUUID(),path:path.resolve(file)};
            return {url:`director://app/reconstruction-video/${current.id}`,name:path.basename(file)};
        },
        async respond(request){
            if(request.method!=='GET'||new URL(request.url).pathname!==`/reconstruction-video/${current?.id}`)return new Response('Not found',{status:404});
            const file=current.path,{size}=await fs.stat(file),range=request.headers.get('range');let start=0,end=size-1;
            if(range){const match=/^bytes=(\d*)-(\d*)$/.exec(range);
                if(!match||!match[1]&&!match[2])return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});
                start=match[1]?Number(match[1]):Math.max(0,size-Number(match[2]));end=match[1]&&match[2]?Math.min(size-1,Number(match[2])):size-1;
                if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>end||start>=size)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});
            }
            const mime={'.mp4':'video/mp4','.m4v':'video/mp4','.mov':'video/quicktime','.webm':'video/webm','.mkv':'video/x-matroska','.avi':'video/x-msvideo'}[path.extname(file).toLowerCase()];
            const headers={'Content-Type':mime,'Content-Length':String(size?end-start+1:0),'Accept-Ranges':'bytes','Cache-Control':'no-store',...(range?{'Content-Range':`bytes ${start}-${end}/${size}`}:{})};
            if(!size)return new Response(null,{headers});
            const stream=createReadStream(file,{start,end}),abort=()=>stream.destroy();request.signal.addEventListener('abort',abort,{once:true});stream.once('close',()=>request.signal.removeEventListener('abort',abort));
            return new Response(Readable.toWeb(stream),{status:range?206:200,headers});
        },
        clear(){current=undefined;},
    };
}
module.exports={createVideoSource};
