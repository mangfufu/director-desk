const fs=require('node:fs/promises'),sync=require('node:fs'),path=require('node:path'),http=require('node:http');
const {randomUUID}=require('node:crypto');
const {FILES}=require('./lite-runtime.cjs');
/** A task-local, sandboxed renderer keeps synchronous pose inference off the editor thread. */
async function runLite({root,task,signal,assetsDirectory}){
 const {BrowserWindow,ipcMain,session}=require('electron');
 signal.throwIfAborted();
 const token=randomUUID(),channel='director-lite-'+token,partition='director-lite-worker';
 const files=new Map(FILES.map(f=>['/'+path.basename(f.file),path.join(root,f.file)]));
 files.set('/worker.js',path.join(assetsDirectory,'lite-worker.js'));files.set('/video',task.input.path);
 let window,origin,ses,settled=false,resolve,reject,writeChain=Promise.resolve(),lastActivity=Date.now();
 const completion=new Promise((r,j)=>{resolve=r;reject=j;});
 completion.catch(()=>{}); // Cancellation can arrive while the initial page is still loading.
 const server=http.createServer(async(req,res)=>{try{
  if(req.headers.host!==new URL(origin).host){res.writeHead(403).end();return;}
  const url=new URL(req.url,origin);if(!url.pathname.startsWith('/'+token+'/')){res.writeHead(404).end();return;}
  const key=url.pathname.slice(token.length+1);
  res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');
  if(key==='/'){res.setHeader('Content-Type','text/html');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; img-src 'self' data:; worker-src 'self' blob:; object-src 'none'");res.end('<!doctype html><meta charset="utf-8"><script type="module" src="worker.js"></script>');return;}
  if(key==='/config'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(task.input));return;}
  const file=files.get(key);if(!file){res.writeHead(404).end();return;}
  const stat=await fs.stat(file);let start=0,end=stat.size-1;const match=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||'');
  if(req.headers.range&&!match){res.writeHead(416).end();return;}
  if(match){start=Number(match[1]);end=match[2]?Math.min(end,Number(match[2])):end;if(start>end){res.writeHead(416).end();return;}res.statusCode=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${stat.size}`);}
  res.setHeader('Content-Type',key.endsWith('.js')||key.endsWith('.mjs')?'text/javascript':key.endsWith('.wasm')?'application/wasm':'application/octet-stream');res.setHeader('Content-Length',end-start+1);res.setHeader('Accept-Ranges','bytes');
  const stream=sync.createReadStream(file,{start,end});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
 }catch{if(!res.headersSent)res.writeHead(404);res.end();}});
 const finish=error=>{if(settled)return;settled=true;error?reject(error):resolve();};
 const cancel=()=>finish(Error('已取消'));
 const writeJson=async(name,value)=>{const file=path.join(task.directory,name);await fs.writeFile(file+'.tmp',JSON.stringify(value));await fs.rename(file+'.tmp',file);};
 const frames=[];
 try{
  await new Promise((r,j)=>{server.once('error',j);server.listen(0,'127.0.0.1',r);});origin=`http://127.0.0.1:${server.address().port}`;
  ses=session.fromPartition(partition);ses.setPermissionRequestHandler((_w,_p,cb)=>cb(false));
  ses.webRequest.onBeforeRequest((details,cb)=>cb({cancel:!details.url.startsWith(origin+'/'+token+'/')&&!details.url.startsWith('blob:'+origin+'/')}));
  window=new BrowserWindow({show:false,webPreferences:{partition,preload:path.join(assetsDirectory,'lite-preload.cjs'),additionalArguments:['--lite-channel='+channel],contextIsolation:true,sandbox:true,nodeIntegration:false,backgroundThrottling:false}});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',event=>event.preventDefault());
  window.webContents.on('render-process-gone',()=>finish(Error('轻量识别已停止，请重试')));
  ipcMain.handle(channel,(event,message)=>{
   if(event.sender!==window.webContents||!event.senderFrame?.url.startsWith(origin+'/'+token+'/'))throw Error('Invalid worker');
   lastActivity=Date.now();
   writeChain=writeChain.then(async()=>{
    signal.throwIfAborted();
    if(message.type==='progress'){task.message=message.message;task.progress=message.progress;}
    else if(message.type==='frame'){
     await fs.appendFile(path.join(task.directory,'lite-frames.jsonl'),JSON.stringify(message.raw)+'\n');
     const p=message.preview;if(p){frames.push({sequence:p.sequence,time:p.time});await fs.mkdir(path.join(task.directory,'previews'),{recursive:true});await writeJson(`previews/${p.sequence}.json`,p);await writeJson('preview.json',p);await writeJson('previews.json',frames);}
    }else if(message.type==='complete'){await writeJson('lite-analysis.json',message.analysis);finish();}
    else if(message.type==='error')throw Error(message.error);
   }).catch(finish);return writeChain;
  });
  signal.addEventListener('abort',cancel,{once:true});signal.throwIfAborted();
  const watchdog=setInterval(()=>{if(Date.now()-lastActivity>120000)finish(Error('轻量识别长时间没有响应，请重试'));},1000);
  try{await window.loadURL(origin+'/'+token+'/');await completion;}finally{clearInterval(watchdog);}
 }finally{
  signal.removeEventListener('abort',cancel);ipcMain.removeHandler(channel);if(window&&!window.isDestroyed())window.destroy();server.closeAllConnections();server.close();await writeChain;
  if(ses){ses.webRequest.onBeforeRequest(null);await ses.clearCache();await ses.clearStorageData();}
 }
}
module.exports={runLite};
