import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';

const output='tmp/transform-drag';await fs.mkdir(output,{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:0}});await server.listen();
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
    const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);await page.waitForFunction(()=>window.__director);
    const result=await page.evaluate(async()=>{
        const {createScene}=await import('/src/scenes.ts'),{entity}=await import('/src/model.ts');
        const {defaultLight,defaultLighting}=await import('/src/lighting/model.ts');
        const {readSceneDocument}=await import('/src/scenes/sequence-project.ts');
        const api=window.__director,e=api.getEngine(),p=createScene('blank');p.duration=4;
        p.entities=p.entities.filter(x=>x.camera);p.room.enabled=false;
        p.entities[0].position=[8,7,12];p.entities[0].camera.target=[0,1,0];
        const floor=entity('prop','cube','Floor',[0,-.2,0]);floor.scale=[18,.4,18];p.entities.push(floor);
        for(let i=0;i<180;i++){const box=entity('prop','cube',`Box ${i}`,[(i%15-7)*.7,.3,Math.floor(i/15)*.6-4]);box.scale=[.5,.6,.4];p.entities.push(box);}
        for(let i=0;i<3;i++){const light=entity('prop','light-point',`Light ${i}`,[(i-1)*4,5,0]);light.light={...defaultLight('light-point'),intensity:100};p.entities.push(light);}
        p.lighting={...defaultLighting(),quality:'low'};api.replaceProject(p);
        const item=e.project.entities[2],id=item.id,origin=item.position.slice(),before=JSON.stringify(api.getDocument());
        e.cb.select(id);e.setObjectSnap(false);e.render();
        const sample=e.sample.bind(e);let samples=0;e.sample=(...args)=>{samples++;return sample(...args);};
        const start=()=>e.gizmo.dispatchEvent({type:'mouseDown'});
        const move=x=>{e.proxy.position.set(x,origin[1],origin[2]);e.gizmo.dispatchEvent({type:'objectChange'});};
        start();for(let i=1;i<=100;i++)move(origin[0]+i*.01);
        const untouched=e.project.entities.find(x=>x.id===id).position[0]===origin[0];
        samples=0;e.flushTransform();const coalescedSamples=samples;e.render();
        // Pointer release before another RAF must commit the final input, not the last rendered one.
        move(origin[0]+2);e.gizmo.dispatchEvent({type:'mouseUp'});e.render();
        const committed=e.project.entities.find(x=>x.id===id).position[0];
        const full=()=>[e.editorRenderer.domElement.toDataURL(),e.shotRenderer.domElement.toDataURL()];
        const released=full();e.shadowCache.clear();e.render();const releaseParity=JSON.stringify(released)===JSON.stringify(full());
        const lightsRestored=[...e.models.values()].flatMap(root=>{const list=[];root.traverse(o=>{if(o.shadow)list.push(o.shadow.intensity===1&&o.shadow.autoUpdate);});return list;}).every(Boolean);
        const read=await api.callTool('director_read',{sections:[]});
        const undone=await api.callTool('director_history',{action:'undo',revision:read.data.revision});if(!undone.ok)throw Error(undone.error);
        const undoRestored=JSON.stringify(api.getDocument())===before;
        e.cb.select(id);start();move(origin[0]+5);e.flushTransform();move(origin[0]+6);
        e.editorRenderer.domElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));e.render();
        const canceled=e.project.entities.find(x=>x.id===id).position[0]===origin[0]&&!e.dragging;
        e.cb.select(id);start();move(origin[0]+3);e.gizmo.dispatchEvent({type:'mouseUp'});e.render();
        const saved=readSceneDocument(JSON.parse(JSON.stringify(api.getDocument())));api.replaceProject(saved);
        const reopen=e.project.entities.find(x=>x.id===id).position[0]===origin[0]+3;
        // Turning adaptive preview off opts out of secondary-shadow simplification.
        e.adaptivePreview=false;e.updateInteractionPreview(true);e.sample(0);e.render();
        const fullPreview=full();e.shadowCache.clear();e.render();const optOutParity=JSON.stringify(fullPreview)===JSON.stringify(full());
        e.updateInteractionPreview(false);e.sample=sample;
        return {untouched,coalescedSamples,committed,expected:origin[0]+2,releaseParity,lightsRestored,undoRestored,canceled,reopen,optOutParity};
    });
    assert.deepEqual(errors,[]);assert.equal(result.coalescedSamples,1);assert.equal(result.committed,result.expected);
    for(const key of ['untouched','releaseParity','lightsRestored','undoRestored','canceled','reopen','optOutParity'])assert.equal(result[key],true,key);
    await fs.writeFile(`${output}/result.json`,JSON.stringify(result,null,2));await page.screenshot({path:`${output}/scene.png`});
    console.log('PASS',JSON.stringify(result));
}finally{await browser.close();await server.close();}
