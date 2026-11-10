import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';

const output='output/playwright/preview-tools';await fs.mkdir(output,{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:0}});await server.listen();
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
    const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);await page.waitForFunction(()=>window.__director);
    await page.evaluate(async()=>{
        const {createScene}=await import('/src/scenes.ts');window.__director.replaceProject(createScene('bedroom'));
        window.__director.setTime(0);
    });
    await page.locator('.composition-menu summary').click();
    for(const key of ['guideThirds','guideCenter','guideSafe'])await page.locator(`[data-guide-setting="${key}"]`).check();
    await page.keyboard.press('Escape');assert.equal(await page.locator('.composition-menu').getAttribute('open'),null);
    for(const aspect of ['16:9','9:16','21:9','3:4','4:3']){
        await page.locator('#aspect').selectOption(aspect);
        for(const mode of ['split','shot']){
            await page.locator(`[data-view="${mode}"]`).click();
            await page.waitForFunction(()=>{
                const a=document.querySelector('.composition-guides').getBoundingClientRect(),b=document.querySelector('#shot-canvas canvas').getBoundingClientRect();
                return a.width>0&&Math.max(...['x','y','width','height'].map(k=>Math.abs(a[k]-b[k])))<=1;
            });
        }
    }
    await page.locator('#aspect').selectOption('16:9');await page.locator('[data-view="split"]').click();
    await page.screenshot({path:`${output}/guides.png`});
    const render=await page.evaluate(async()=>{
        const engine=window.__director.getEngine();
        const capture=async()=>{engine.exporting=true;try{await engine.prepareOutput(0);engine.renderOutput(0,640,360);return engine.renderOutput(0,640,360).toDataURL();}finally{engine.restorePreview(0);}};
        const before=await capture();
        const result=await window.__director.callTool('director_settings',{scope:'editor',action:'set',requestId:'hide-guides',patch:{guideThirds:false,guideCenter:false,guideSafe:false}});
        if(!result.ok)throw Error(result.error);return before===await capture();
    });
    assert.equal(render,true,'guides never alter output pixels');
    await page.evaluate(async()=>{
        const result=await window.__director.callTool('director_settings',{scope:'editor',action:'set',requestId:'show-guides',patch:{guideThirds:true,guideCenter:true,guideSafe:true}});
        if(!result.ok)throw Error(result.error);
    });
    await page.reload();await page.waitForFunction(()=>window.__director);
    for(const key of ['guideThirds','guideCenter','guideSafe'])assert.equal(await page.locator(`[data-guide-setting="${key}"]`).isChecked(),true);
    await page.evaluate(async()=>{const {setLanguage}=await import('/src/i18n/locale.ts');setLanguage('en');});
    assert.equal(await page.locator('.composition-menu summary').innerText(),'Guides');
    await page.locator('.composition-menu summary').click();assert.match(await page.locator('.composition-options').innerText(),/Rule of Thirds/);
    await page.keyboard.press('Escape');
    // Inject expensive sampling to deterministically exercise adaptive quality;
    // this is an integration check, not a synthetic performance claim.
    await page.evaluate(()=>{
        const engine=window.__director.getEngine(),sample=engine.pluginHooks.sample.bind(engine.pluginHooks);
        window.__originalSample=sample;window.__slow=true;
        engine.pluginHooks.sample=(...args)=>{const result=sample(...args);if(window.__slow){const start=performance.now();while(performance.now()-start<25){}}return result;};
        window.__fullRatio=engine.shotRenderer.getPixelRatio();
    });
    const ruler=await page.locator('.ruler').boundingBox();
    await page.mouse.move(ruler.x+60,ruler.y+10);await page.mouse.down();
    for(let i=1;i<=5;i++){await page.mouse.move(ruler.x+60+i*25,ruler.y+10);await page.waitForTimeout(35);}
    await page.waitForFunction(()=>window.__director.getEngine().draftPreview);
    assert.ok(await page.evaluate(()=>window.__director.getEngine().shotRenderer.getPixelRatio()<window.__fullRatio));
    const outputSize=await page.evaluate(()=>{
        const engine=window.__director.getEngine();engine.exporting=true;
        try{const canvas=engine.renderOutput(1,640,360);return {draft:engine.draftPreview,width:canvas.width,height:canvas.height};}
        finally{engine.restorePreview(engine.time);}
    });
    assert.deepEqual(outputSize,{draft:false,width:640,height:360});
    const screenshot=await page.evaluate(async()=>{
        const api=window.__director,engine=api.getEngine(),{exportFiles}=await import('/src/automation/file-export.ts');
        const desktop=window.directorDesktop,prepare=engine.prepareOutput.bind(engine),render=engine.renderOutput.bind(engine),states=[];
        window.directorDesktop={files:async action=>({ok:true,data:action==='automation-write-begin'?{id:'test',path:'test.png',filename:'test.png'}:action==='automation-write-close'?{saved:true}:{}})};
        engine.prepareOutput=(...args)=>{states.push(['prepare',engine.exporting,engine.draftPreview]);return prepare(...args);};
        engine.renderOutput=(...args)=>{states.push(['render',engine.exporting,engine.draftPreview]);return render(...args);};
        try{
            const result=await exportFiles({engine,time:1,scenes:{document:()=>api.getDocument()}},{kind:'screenshot',size:640},new AbortController().signal,()=>{},()=>{});
            return {states,saved:result.files[0].saved,exporting:engine.exporting};
        }finally{window.directorDesktop=desktop;engine.prepareOutput=prepare;engine.renderOutput=render;}
    });
    assert.deepEqual(screenshot,{states:[['prepare',true,false],['render',true,false]],saved:true,exporting:false});
    await page.mouse.up();
    await page.waitForFunction(()=>!window.__director.getEngine().draftPreview&&window.__director.getEngine().shotRenderer.getPixelRatio()===window.__fullRatio);
    await page.evaluate(()=>{const engine=window.__director.getEngine();window.__slow=false;engine.pluginHooks.sample=window.__originalSample;});
    const modes=await page.evaluate(()=>{
        const engine=window.__director.getEngine();
        engine.previewQuality='draft';engine.updateInteractionPreview(true);engine.updateInteractionPreview(false);
        const manual=engine.draftPreview;
        engine.previewQuality='full';engine.adaptivePreview=false;engine.updateInteractionPreview(true);
        const disabled=engine.draftPreview;engine.adaptivePreview=true;engine.updateInteractionPreview(false);
        return {manual,disabled};
    });
    assert.deepEqual(modes,{manual:true,disabled:false});
    assert.deepEqual(errors,[]);
    console.log('PASS: all five guide aspect ratios, split/shot alignment, persistence, English, MCP settings, unchanged output pixels; slow interactive preview lowers resolution then restores; export stays full.');
}finally{await browser.close();await server.close();}
