import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';

const output='tmp/shadow-cache';await fs.mkdir(output,{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:0}});await server.listen();
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
    const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);await page.waitForFunction(()=>window.__director);
    const results=await page.evaluate(async()=>{
        const {createScene}=await import('/src/scenes.ts'),{entity}=await import('/src/model.ts');
        const {defaultLight,defaultLighting}=await import('/src/lighting/model.ts');
        const api=window.__director,e=api.getEngine(),p=createScene('blank');p.duration=4;
        p.entities=p.entities.filter(x=>x.camera);p.room.enabled=false;
        p.entities[0].position=[8,7,12];p.entities[0].camera.target=[0,1,0];
        const floor=entity('prop','cube','Floor',[0,-.2,0]);floor.scale=[15,.4,15];p.entities.push(floor);
        for(let i=0;i<60;i++){const box=entity('prop','cube',`Box ${i}`,[(i%10-5)*1.1,.5,Math.floor(i/10)-3]);p.entities.push(box);}
        for(let i=0;i<3;i++){const light=entity('prop','light-point',`Light ${i}`,[(i-1)*4,5,0]);light.light={...defaultLight('light-point'),intensity:100};p.entities.push(light);}
        p.lighting={...defaultLighting(),quality:'low'};api.replaceProject(p);
        const read=(renderers=[e.editorRenderer,e.shotRenderer])=>renderers.map(r=>{const gl=r.getContext(),pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;});
        const compare=(cached,direct)=>{let changed=0,max=0,total=0;for(let v=0;v<cached.length;v++){total+=cached[v].length;for(let i=0;i<cached[v].length;i++){const d=Math.abs(cached[v][i]-direct[v][i]);if(d){changed++;max=Math.max(max,d);}}}return {equal:max<=1&&changed<=total*.0001,changed,max};};
        const check=(name,time)=>{
            e.sample(time);e.render();e.render();const cached=read(),calls=e.editorRenderer.info.render.calls+e.shotRenderer.info.render.calls;
            e.shadowCache.clear();e.render();const direct=read(),fullCalls=e.editorRenderer.info.render.calls+e.shotRenderer.info.render.calls;
            return {name,...compare(cached,direct),calls,fullCalls};
        };
        const result=[check('static',0)];
        const T=await import('/node_modules/three/build/three.module.js');
        e.models.get(e.project.entities[2].id).traverse(n=>{if(n.isMesh){n.material.transparent=true;n.material.opacity=.5;n.material.side=T.DoubleSide;n.material.needsUpdate=true;}});
        result.push(check('transparent double-sided',0));
        e.editorCamera.position.x+=3;e.orbit.update();result.push(check('orbit',0));
        e.project.entities[2].path={smooth:false,points:[{time:0,position:[0,1,0]},{time:2,position:[2,3,0]}]};
        result.push(check('animated object',1));
        e.project.entities[3].visible=false;result.push(check('visibility',1));
        e.project.entities.find(x=>x.light).position.x+=2;result.push(check('moving light',1));
        e.project.entities.find(x=>x.light).light.shadows=false;result.push(check('shadow switch',1));
        const {HUMAN_ASSETS}=await import('/src/assets/catalog/humans.ts');
        const animated=api.getProject(),actor=entity('actor',HUMAN_ASSETS[0].id,'Actor',[0,0,4.5]);
        actor.color='#666666';actor.clips=[{id:'walk-test',action:'walk',start:0,end:4,speed:1}];animated.entities.push(actor);api.replaceProject(animated);
        result.push(check('actor animation',.7));result.push(check('actor reverse seek',.2));
        e.exporting=true;e.sample(1);e.renderOutput(1,640,360,'program',null);
        const first=read([e.shotRenderer]);e.shadowCache.clear();e.renderOutput(1,640,360,'program',null);
        result.push({name:'export',...compare(first,read([e.shotRenderer]))});e.restorePreview(1);
        return result;
    });
    assert.deepEqual(errors,[]);assert.ok(results.every(x=>x.equal),JSON.stringify(results));
    assert.ok(results[0].fullCalls>results[0].calls,JSON.stringify(results[0]));
    assert.ok(results[1].fullCalls>results[1].calls,JSON.stringify(results[1]));
    await fs.writeFile(`${output}/result.json`,JSON.stringify(results,null,2));await page.screenshot({path:`${output}/scene.png`});
    console.log('PASS',JSON.stringify(results));
}finally{await browser.close();await server.close();}
