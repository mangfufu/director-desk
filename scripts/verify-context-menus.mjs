import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const output='output/playwright/context-menus';await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
    const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
    await page.goto(process.env.DIRECTOR_URL||'http://127.0.0.1:5178');await page.waitForFunction(()=>window.__director);
    await page.evaluate(async()=>{
        const {createScene}=await import('/src/scenes.ts'),{entity}=await import('/src/model.ts');
        const p=createScene('blank'),e=entity('actor','human-adult','右键人物');e.id='context-actor';
        e.clips=[{id:'a',action:'walk',start:0,end:4,speed:1},{id:'b',action:'run',start:4,end:8,speed:1}];
        p.entities.push(e);p.duration=12;p.cuts.push({time:6,cameraId:p.cuts[0].cameraId});window.__director.replaceProject(p);
    });
    const menu=page.locator('.editor-context-menu');
    const entry=id=>page.locator(`[data-context-command="${id}"]`);
    const clips=()=>page.evaluate(()=>window.__director.getProject().entities.find(e=>e.id==='context-actor').clips);
    const right=async(id,x=60)=>page.locator(`[data-clip-id="${id}"]`).click({button:'right',position:{x,y:12}});
    await right('a');assert.equal(await entry('split').isDisabled(),true,'playhead at the clip boundary cannot split, even if the pointer is inside');
    await page.keyboard.press('Escape');
    await page.evaluate(()=>window.__director.setTime(1));
    await right('a',150);assert.equal(await menu.count(),1);
    await page.screenshot({path:`${output}/timeline.png`});
    await entry('split').click();assert.deepEqual((await clips()).map(c=>[c.start,c.end]),[[0,1],[1,4],[4,8]]);
    assert.equal(await page.evaluate(()=>window.__director.getEngine().time),1,'split retains the playhead instead of seeking to the pointer');
    assert.equal(await menu.count(),0);await page.keyboard.press('Control+z');assert.equal((await clips()).length,2);
    // Right-click preserves an existing multi-selection, and one undo restores both clips.
    await page.locator('[data-clip-id="a"]').click({modifiers:['Control']});
    await page.locator('[data-clip-id="b"]').click({modifiers:['Control']});
    await right('a');assert.equal(await page.locator('.clip-selected').count(),2);
    await entry('delete-clips').click();assert.equal((await clips()).length,0);
    assert.equal(await page.locator('[data-select="context-actor"]').count()>0,true);
    await page.keyboard.press('Control+z');assert.equal((await clips()).length,2);
    await right('a');await entry('trim').click();await page.locator('#clip-duration').waitFor();
    await page.locator('[data-act="close-modal"]').first().click();
    // First shot cannot be removed; later shots can be removed and undone.
    await page.locator('[data-cut="0"]').click({button:'right',position:{x:40,y:12}});
    assert.equal(await entry('delete-clips').isDisabled(),true);await page.keyboard.press('Escape');
    await page.locator('[data-cut="1"]').click({button:'right',position:{x:40,y:12}});
    await entry('delete-clips').click();assert.equal(await page.evaluate(()=>window.__director.getProject().cuts.length),1);
    await page.keyboard.press('Control+z');assert.equal(await page.evaluate(()=>window.__director.getProject().cuts.length),2);
    // Locked clips are selectable, but their edit actions are disabled.
    await page.evaluate(()=>{const p=window.__director.getProject();p.entities.find(e=>e.id==='context-actor').locked=true;window.__director.replaceProject(p);});
    await right('a');for(const id of ['split','trim','delete-clips'])assert.equal(await entry(id).isDisabled(),true);
    await page.keyboard.press('Escape');
    await page.evaluate(()=>{const p=window.__director.getProject();p.entities.find(e=>e.id==='context-actor').locked=false;window.__director.replaceProject(p);});
    // Empty lane: seek only; a fixed-camera placeholder must not masquerade as a clip.
    await page.locator('[data-track-key="entity:context-actor"] .track-lane').click({button:'right',position:{x:570,y:18}});
    assert.equal(await entry('split').count(),0);await entry('seek').click();
    assert.equal(await page.evaluate(()=>window.__director.getEngine().time),9.5);
    const idle=page.locator('.timeline-clip.idle').first();
    if(await idle.count()){await idle.click({button:'right',position:{x:50,y:12}});assert.equal(await entry('split').count(),0);await page.keyboard.press('Escape');}
    await page.evaluate(()=>window.__director.setTime(0));
    // Projected model pick must select the hit object, not the previously selected camera.
    const point=await page.evaluate(()=>{
        const engine=window.__director.getEngine(),box=engine.editorRenderer.domElement.getBoundingClientRect();
        const root=engine.models.get('context-actor'),p=root.position.clone();p.y+=1;p.project(engine.editorCamera);
        return {x:box.left+(p.x*.5+.5)*box.width,y:box.top+(-p.y*.5+.5)*box.height};
    });
    await page.mouse.click(point.x,point.y,{button:'right'});assert.equal(await entry('duplicate').count(),1);
    assert.equal(await page.locator('#inspector-header h2').innerText(),'右键人物');
    await page.screenshot({path:`${output}/canvas.png`});await entry('duplicate').click();
    assert.equal(await page.evaluate(()=>window.__director.getProject().entities.filter(e=>e.kind==='actor').length),2);
    await page.keyboard.press('Control+z');assert.equal(await page.evaluate(()=>window.__director.getProject().entities.filter(e=>e.kind==='actor').length),1);
    const canvas=page.locator('#stage-canvas canvas');
    const before=await page.evaluate(()=>window.__director.getEngine().editorCamera.position.toArray());
    await page.mouse.move(point.x,point.y);await page.mouse.down({button:'right'});
    await page.mouse.move(point.x+80,point.y+30,{steps:8});await page.mouse.up({button:'right'});
    assert.equal(await menu.count(),0,'right pan must not open a menu');
    assert.notDeepEqual(await page.evaluate(()=>window.__director.getEngine().editorCamera.position.toArray()),before);
    await page.mouse.move(point.x,point.y);await page.mouse.down({button:'right'});
    await page.mouse.move(point.x+70,point.y,{steps:5});await page.mouse.move(point.x,point.y,{steps:5});await page.mouse.up({button:'right'});
    assert.equal(await menu.count(),0,'returning a drag to its start must not count as a click');
    // Shot view exposes camera actions, not misleading picks through lens distortion.
    await page.locator('#shot-canvas canvas').click({button:'right',position:{x:80,y:80}});
    await entry('camera-properties').click();assert.match(await page.locator('#inspector-header h2').innerText(),/机位|摄影/);
    // Keyboard access and English labels, without leaking shortcuts behind the menu.
    await right('a');await page.keyboard.press('Escape');await page.keyboard.press('Shift+F10');
    assert.equal(await menu.count(),1);await page.keyboard.press('End');
    assert.equal(await page.evaluate(()=>document.activeElement.dataset.contextCommand),'redo');await page.keyboard.press('Escape');
    await page.evaluate(()=>document.querySelector('#settings-toggle').click());await page.locator('#ui-language').selectOption('en');
    await page.locator('[data-act="close-modal"]').first().click();
    await page.setViewportSize({width:1280,height:720});await right('a');assert.equal(await entry('split').innerText(),'Split at Playhead');
    const box=await menu.boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=1280&&box.y+box.height<=720);
    await page.keyboard.press('Delete');assert.equal((await clips()).length,2,'editor delete shortcut is inactive while menu is open');
    await page.screenshot({path:`${output}/english-1280.png`});await page.keyboard.press('Escape');
    await page.locator('[data-track-key="entity:context-actor"] [data-select="context-actor"]').click({button:'right'});
    assert.equal(await entry('draw-path').innerText(),'Draw Path');await page.keyboard.press('Escape');
    // Path sections use the same split/delete transactions as the existing toolbar.
    await page.evaluate(()=>{const p=window.__director.getProject();p.entities.find(e=>e.id==='context-actor').path={smooth:false,points:[{time:0,position:[0,0,0]},{time:4,position:[4,0,0]}]};window.__director.replaceProject(p);});
    const pathBar=page.locator('[data-path-id="context-actor"]').first();await pathBar.scrollIntoViewIfNeeded();
    await page.evaluate(()=>window.__director.setTime(2));
    await pathBar.click({button:'right',position:{x:60,y:12}});await entry('split').click();
    const pathState=()=>page.evaluate(()=>window.__director.getProject().entities.find(e=>e.id==='context-actor').path);
    assert.deepEqual((await pathState()).sections.map(s=>[s.start,s.end]),[[0,2],[2,4]]);
    await page.locator('[data-path-id="context-actor"][data-section="1"]').click({button:'right',position:{x:60,y:12}});
    await entry('delete-clips').click();assert.deepEqual((await pathState()).sections.map(s=>[s.start,s.end]),[[0,2]]);
    await page.keyboard.press('Control+z');assert.equal((await pathState()).sections.length,2);
    assert.deepEqual(errors,[]);console.log('PASS: timeline split/trim/delete, multi-select, undo, locked clips, shot cuts, empty lanes, canvas pick/duplicate, right-pan, camera menu, keyboard and English layout');
} finally {await browser.close();}
