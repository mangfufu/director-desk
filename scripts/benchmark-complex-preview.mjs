import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';

const output='output/playwright/complex-preview';await fs.mkdir(output,{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:0}});await server.listen();
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
    const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);await page.waitForFunction(()=>window.__director);
    const results=[];
    for(const kind of ['model','video']){
        const fixture=await page.evaluate(async kind=>{
            const {createScene}=await import('/src/scenes.ts'),{entity}=await import('/src/model.ts');
            const p=createScene('blank');p.duration=4;
            const camera=p.entities.find(e=>e.camera);camera.position=[0,9,23];camera.camera.target=[0,2,0];
            const started=performance.now();
            if(kind==='model'){
                const {packModelFilesAsync,modelResourceIdAsync}=await import('/src/resources/model-import-worker.ts');
                const n=240,lines=[];
                for(let y=0;y<=n;y++)for(let x=0;x<=n;x++)lines.push(`v ${x/n*6-3} ${Math.sin(x/n*8)*Math.cos(y/n*8)*.4} ${y/n*6-3}`);
                for(let y=0;y<n;y++)for(let x=0;x<n;x++){
                    const a=y*(n+1)+x+1,b=a+n+1;lines.push(`f ${a} ${b} ${a+1}`,`f ${a+1} ${b} ${b+1}`);
                }
                const bytes=new TextEncoder().encode(lines.join('\n'));
                const pkg=await packModelFilesAsync('terrain.obj',[{path:'terrain.obj',bytes}]);
                const id=await modelResourceIdAsync(pkg);p.version=2;
                p.resources=[{id,name:'Generated terrain',package:pkg,copyright:'',license:'CC0',source:'Procedural benchmark fixture'}];
                for(let i=0;i<6;i++){
                    const e=entity('prop','external-model',`地形 ${i}`,[(i%3-1)*7,1,Math.floor(i/3)*7-5]);
                    e.external={resourceId:id,appearance:'color',unitScale:1,orientation:[0,0,0]};p.entities.push(e);
                }
                await window.__director.getEngine().externalModels.prepare(p);
            }else{
                const {Output,BufferTarget,CanvasSource,Mp4OutputFormat}=await import('/scripts/browser-media-deps.ts');
                const {importMedia}=await import('/src/media/source.ts'),{defaultSurfaceLayer}=await import('/src/media/model.ts');
                p.media=[];
                for(let source=0;source<2;source++){
                    const canvas=document.createElement('canvas');canvas.width=1920;canvas.height=1080;const ctx=canvas.getContext('2d');
                    const target=new BufferTarget(),out=new Output({format:new Mp4OutputFormat(),target});
                    const video=new CanvasSource(canvas,{codec:'avc',bitrate:2500000});out.addVideoTrack(video,{frameRate:24});await out.start();
                    for(let f=0;f<48;f++){ctx.fillStyle=source?'#ddd':'#222';ctx.fillRect(0,0,1920,1080);ctx.fillStyle=source?'#222':'#ddd';ctx.fillRect(f*35,100,200,800);await video.add(f/24,1/24);}
                    video.close();await out.finalize();
                    p.media.push(await importMedia(new File([target.buffer],`synthetic-${source}.mp4`,{type:'video/mp4'})));
                }
                for(let i=0;i<16;i++){
                    const media=p.media[i%2],e=entity('prop','cube',`屏幕 ${i}`,[(i%4-1.5)*3,(Math.floor(i/4)+.5)*2,0]);e.scale=[2.5,1.5,.2];
                    e.surface={layers:[{...defaultSurfaceLayer(media.id),mapping:'box',unlit:true,timeOffset:Math.floor(i/2)%4*.1}]};p.entities.push(e);
                }
            }
            const api=window.__director,engine=api.getEngine();api.replaceProject(p);await engine.prepareOutput(0);engine.render();
            const sample=engine.sample.bind(engine),render=engine.render.bind(engine);
            window.__metrics={samples:[],renders:[],ratios:[],active:false};
            engine.sample=(...args)=>{const start=performance.now(),result=sample(...args);if(window.__metrics.active)window.__metrics.samples.push(performance.now()-start);return result;};
            engine.render=(...args)=>{const start=performance.now(),result=render(...args);if(window.__metrics.active){window.__metrics.renders.push(performance.now()-start);window.__metrics.ratios.push(engine.shotRenderer.getPixelRatio());}return result;};
            window.__restoreMetrics=()=>{engine.sample=sample;engine.render=render;};
            return {setupMs:performance.now()-started,entities:p.entities.length,triangles:kind==='model'?240*240*2*6:null,sources:p.media?.length??0};
        },kind);
        const modes=[];
        for(const adaptive of [false,true]){
            await page.evaluate(async adaptive=>{
                const r=await window.__director.callTool('director_settings',{scope:'editor',action:'set',requestId:crypto.randomUUID(),patch:{adaptivePreview:adaptive}});if(!r.ok)throw Error(r.error);
                window.__director.setTime(0);Object.assign(window.__metrics,{samples:[],renders:[],ratios:[],active:true});
            },adaptive);
            const ruler=await page.locator('.ruler').boundingBox();
            await page.mouse.move(ruler.x+2,ruler.y+10);await page.mouse.down();
            for(let i=1;i<=40;i++)await page.mouse.move(ruler.x+i*5,ruler.y+10);
            await page.mouse.up();await page.waitForTimeout(200);
            const measured=await page.evaluate(async()=>{
                const m=window.__metrics;m.active=false;const engine=window.__director.getEngine();await engine.prepareOutput(engine.time);
                const stats=a=>{a.sort((x,y)=>x-y);return {count:a.length,median:a[Math.floor(a.length*.5)]??0,p95:a[Math.floor(a.length*.95)]??0};};
                return {samples:stats(m.samples),renderCalls:stats(m.renders),minRatio:Math.min(...m.ratios),restoredRatio:engine.shotRenderer.getPixelRatio(),media:engine.surfaces.textures.statistics()};
            });
            assert.equal(measured.restoredRatio,1);assert.deepEqual(measured.media.errors,[]);
            if(kind==='video'){assert.equal(measured.media.sources,2);assert.equal(measured.media.textures,8);}
            modes.push({adaptive,...measured});
        }
        await page.screenshot({path:`${output}/${kind}.png`});
        const cached=await page.evaluate(async()=>{
            const api=window.__director,start=performance.now();
            const reply=await api.callTool('director_preview',{action:'build',start:0,end:.5,size:640,requestId:crypto.randomUUID()});if(!reply.ok)throw Error(reply.error);
            let done;
            for(let i=0;i<2000;i++){const response=await api.callTool('director_job',{id:reply.data.jobId});if(response.data.status!=='running'){done=response.data;break;}await new Promise(r=>setTimeout(r,20));}
            if(done?.status!=='completed')throw Error(done?.error??'Preview timed out');
            return {ms:performance.now()-start,...done.result};
        });assert.equal(cached.frames,12);
        await page.evaluate(async()=>{await window.__director.callTool('director_preview',{action:'open'});Object.assign(window.__metrics,{samples:[],renders:[],ratios:[],active:true});});
        await page.locator('#cached-play').click();await page.waitForTimeout(700);await page.locator('#cached-play').click();
        const cachedSamples=await page.evaluate(()=>{window.__metrics.active=false;return window.__metrics.samples.length;});assert.equal(cachedSamples,0);
        await page.locator('.preview-cache-modal [data-act="close-modal"]').click();
        // Verify decoded resources also survive exact output and are released on scene change.
        const release=await page.evaluate(async()=>{
            const api=window.__director,engine=api.getEngine();window.__restoreMetrics();engine.exporting=true;
            try{await engine.prepareOutput(1);engine.renderOutput(1,640,360);}finally{engine.restorePreview(0);}
            const {createScene}=await import('/src/scenes.ts');api.replaceProject(createScene('blank'));await engine.prepareOutput(0);
            return engine.surfaces.textures.statistics();
        });assert.equal(release.textures,0);assert.equal(release.sources,0);
        const result={kind,...fixture,modes,cached:{...cached,samplesDuringLoop:cachedSamples}};results.push(result);console.log(JSON.stringify(result));
    }
    assert.deepEqual(errors,[]);
    await fs.writeFile(`${output}/result.json`,JSON.stringify({platform:os.platform(),cpu:os.cpus()[0]?.model,browser:browser.version(),results},null,2));
}finally{await browser.close();await server.close();}
