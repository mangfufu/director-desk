import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const output='output/playwright/timeline-insertion';await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
    const page=await browser.newPage({viewport:{width:1560,height:1000}}), errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
    await page.goto(process.env.DIRECTOR_URL||'http://127.0.0.1:5178');await page.waitForFunction(()=>window.__director);
    await page.evaluate(async()=>{
        const {createScene}=await import('/src/scenes.ts'),{entity}=await import('/src/model.ts');
        const p=createScene('blank'),e=entity('actor','human-adult','插入测试');e.id='insert-target';
        e.clips=[{id:'a',action:'walk',start:0,end:2,speed:1},{id:'b',action:'run',start:2,end:5,speed:1},{id:'c',action:'wave',start:5,end:7,speed:1}];
        p.entities.push(e);window.__director.replaceProject(p);
    });
    const ranges=()=>page.evaluate(()=>window.__director.getProject().entities.find(e=>e.id==='insert-target').clips.map(c=>[c.id,c.start,c.end]));
    const lane=page.locator('[data-track-key="entity:insert-target"] .track-lane');
    const drag=async(id,time)=>{
        const b=await page.locator(`[data-clip-id="${id}"]`).boundingBox(),l=await lane.boundingBox();
        await page.mouse.move(b.x+20,b.y+12);await page.mouse.down();await page.mouse.move(l.x+time*60,b.y+12,{steps:6});
    };
    await drag('c',2.5);
    assert.match(await page.locator('.motion-drop-status').innerText(),/插在前面/);
    assert.deepEqual(await ranges(),[['a',0,2],['b',2,5],['c',5,7]],'drag only previews until release');
    const l=await lane.boundingBox(),b=await page.locator('[data-clip-id="b"]').boundingBox();
    assert.ok(Math.abs(b.x-l.x-120)<1,'neighbour stays still during drag');
    assert.equal(await page.locator('.timeline-drag-floating').count(),1);
    assert.ok(Math.abs((await page.locator('.motion-drop-ghost').boundingBox()).x-l.x-120)<1);
    assert.equal(await page.locator('.clip-selected').count(),1);
    await page.screenshot({path:`${output}/insert-before.png`});
    await page.mouse.up();assert.deepEqual(await ranges(),[['a',0,2],['b',4,7],['c',2,4]]);await page.keyboard.press('Control+z');
    assert.deepEqual(await ranges(),[['a',0,2],['b',2,5],['c',5,7]]);
    await drag('a',4.5);assert.match(await page.locator('.motion-drop-status').innerText(),/插在后面/);
    assert.deepEqual(await ranges(),[['a',0,2],['b',2,5],['c',5,7]]);
    await page.keyboard.press('Escape');await page.mouse.up();
    assert.deepEqual(await ranges(),[['a',0,2],['b',2,5],['c',5,7]]);
    assert.equal(await page.locator('.motion-drop-status').count(),0);
    assert.equal(await page.evaluate(()=>document.documentElement.dataset.timelineDrag),undefined);
    // Multi-selection keeps spacing and can move through stationary clips.
    await page.locator('[data-clip-id="a"]').click({modifiers:['Control']});
    await page.locator('[data-clip-id="c"]').click({modifiers:['Control']});
    // Reset selection explicitly, independent of the cancelled drag's anchor.
    await page.evaluate(async()=>{
        const {setSelectedClips}=await import('/src/editor/timeline-selection.ts');
        setSelectedClips(['a','c'].map(id=>({kind:'action',entityId:'insert-target',id})));
        // Pointerdown refreshes the view using this exact selection.
    });
    await drag('a',3);
    assert.deepEqual(await ranges(),[['a',0,2],['b',2,5],['c',5,7]]);
    await page.mouse.up();assert.deepEqual(await ranges(),[['a',2,4],['b',4,7],['c',7,9]]);await page.keyboard.press('Control+z');
    assert.deepEqual(await ranges(),[['a',0,2],['b',2,5],['c',5,7]]);
    // Native library drop uses the same left/right insertion preview.
    await page.locator('[data-side="motions"]').click();await page.locator('#search').fill('basic-wave');
    const source=page.locator('[data-library-motion="basic-wave"]'),s=await source.boundingBox(),target=await lane.boundingBox();
    await page.mouse.move(s.x+35,s.y+20);await page.mouse.down();await page.mouse.move(s.x+50,s.y+23,{steps:5});
    await page.mouse.move(target.x+150,target.y+18,{steps:10});await page.mouse.move(target.x+151,target.y+18);
    await page.locator('.motion-drop-ghost').waitFor();
    assert.match(await page.locator('.motion-drop-status').innerText(),/插在前面.*2\.00—5\.00/);
    assert.deepEqual(await ranges(),[['a',0,2],['b',2,5],['c',5,7]],'hover does not write project');
    const shifted=await page.locator('[data-clip-id="b"]').boundingBox();assert.ok(Math.abs(shifted.x-target.x-120)<1);
    await page.screenshot({path:`${output}/library-insert.png`});await page.mouse.up();
    await page.waitForFunction(()=>window.__director.getProject().entities.find(e=>e.id==='insert-target').clips.length===4);
    assert.deepEqual((await ranges()).map(c=>c.slice(1)),[[0,2],[2,5],[5,8],[8,10]]);
    assert.equal(await page.locator('.motion-drop-ghost').count(),0);
    assert.equal(await page.locator('[data-act="play"]').isEnabled(),true);
    await page.locator('[data-act="play"]').click();await page.waitForFunction(()=>document.querySelector('[data-act="play"]').getAttribute('aria-label')==='暂停');
    await page.locator('[data-act="play"]').click();
    await page.keyboard.press('Control+z');assert.deepEqual(await ranges(),[['a',0,2],['b',2,5],['c',5,7]]);
    // Reproduce the reported narrow boundary with the clip grabbed in its middle.
    await page.evaluate(()=>{
        const p=window.__director.getProject(),e=p.entities.find(e=>e.id==='insert-target');
        e.clips=[{id:'long',action:'run',start:5,end:8,speed:1},{id:'jump',action:'jump',start:9.5,end:10.5,speed:1},{id:'walk',action:'walk',start:10.5,end:14.5,speed:1}];window.__director.replaceProject(p);
        const engine=window.__director.getEngine(),sample=engine.sample.bind(engine);window.__sampleCount=0;engine.sample=(...args)=>{window.__sampleCount++;return sample(...args);};
    });
    const long=await page.locator('[data-clip-id="long"]').boundingBox(),track=await lane.boundingBox();
    await page.mouse.move(long.x+long.width/2,long.y+12);await page.mouse.down();
    await page.mouse.move(track.x+10.5*60,long.y+12,{steps:12});
    await page.waitForFunction(()=>document.querySelector('.motion-drop-status')?.textContent.includes('10.50'));
    assert.deepEqual(await ranges(),[['long',5,8],['jump',9.5,10.5],['walk',10.5,14.5]]);
    const performance=await page.evaluate(async()=>{
        const sampleStart=window.__sampleCount,root=document.querySelector('#timeline-content'),floating=document.querySelector('.timeline-drag-floating');
        const ghost=document.querySelector('.motion-drop-ghost'),x=ghost.getBoundingClientRect().left,y=ghost.getBoundingClientRect().top+12;
        const start=window.performance.now();for(let i=0;i<240;i++)root.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:1,buttons:1,clientX:x+(i%3),clientY:y}));
        const eventMs=window.performance.now()-start;
        await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
        return {eventMs,samples:window.__sampleCount-sampleStart,floating:!!floating};
    });
    assert.equal(performance.samples,0,'preview does not repeatedly sample the 3D scene');assert.ok(performance.floating);
    await page.screenshot({path:`${output}/between-actions.png`});await page.mouse.up();
    assert.deepEqual(await ranges(),[['long',10.5,13.5],['jump',9.5,10.5],['walk',13.5,17.5]]);
    assert.equal(await page.locator('.timeline-drag-floating,.motion-drop-ghost,.timeline-insert-marker').count(),0);
    assert.deepEqual(errors,[]);
    console.log('PASS: floating clip/ghost, between-actions insertion, preview-only drag, multi-select, cancel/undo, library drop and playback',performance);
} finally { await browser.close(); }
