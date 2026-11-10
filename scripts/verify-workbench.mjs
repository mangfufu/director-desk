import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const out='output/playwright/workbench';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});
try {
    const context=await browser.newContext({viewport:{width:1600,height:1000},permissions:['clipboard-read','clipboard-write']});
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(process.env.DIRECTOR_URL||'http://127.0.0.1:5178');await page.waitForFunction(()=>window.__director);
    assert.equal(await page.locator('.workbench-navigation .view-modes').count(),1);
    assert.notEqual(await page.locator('#scene-switch').evaluate(el=>getComputedStyle(el).backgroundImage),'none','scene picker keeps its dropdown affordance');
    const tabBounds=await page.locator('.side-tabs').evaluate(el=>{
        const r=el.getBoundingClientRect(),tabs=[...el.querySelectorAll('button')].map(b=>b.getBoundingClientRect());
        return {left:r.left,right:r.right,top:r.top,contentBottom:r.bottom-parseFloat(getComputedStyle(el).borderBottomWidth),tabs:tabs.map(t=>({left:t.left,right:t.right,top:t.top,bottom:t.bottom}))};
    });
    assert.equal(tabBounds.tabs[0].left,tabBounds.left,'first tab fills the left edge');
    assert.equal(tabBounds.tabs.at(-1).right,tabBounds.right,'last tab fills the right edge');
    for(const tab of tabBounds.tabs){assert.equal(tab.top,tabBounds.top);assert.equal(tab.bottom,tabBounds.contentBottom);}
    assert.equal(tabBounds.tabs[0].right,tabBounds.tabs[1].left,'no gap between tab highlights');
    const edges=await page.evaluate(()=>{
        const bounds=s=>document.querySelector(s).getBoundingClientRect().toJSON();
        return {top:['.side-tabs','.view-toolbar','#inspector-scope'].map(bounds),bottom:['.monitor-strip','#inspector-footer'].map(bounds)};
    });
    for(const r of edges.top){assert.equal(r.top,edges.top[0].top);assert.equal(r.bottom,edges.top[0].bottom,'workspace bars share one baseline');}
    assert.equal(edges.bottom[0].top,edges.bottom[1].top,'monitor and inspector footers align');
    const tracks=await page.locator('.timeline-row:not(.ruler-row)').first().evaluate(el=>[...el.querySelectorAll(':scope>.track-label,:scope>.track-lane')].map(e=>e.getBoundingClientRect().toJSON()));
    assert.equal(tracks[0].bottom,tracks[1].bottom,'track rule continues across label and content');

    assert.equal(await page.locator('.side-tabs [data-side]').count(),1);
    await page.locator('[data-side=scene]').focus();await page.keyboard.press('ArrowRight');
    await page.locator('.asset-card').first().waitFor();
    await page.keyboard.press('Home');assert.equal(await page.locator('#resource-tabs').isVisible(),false);
    await page.locator('[data-view=stage]').focus();await page.keyboard.press('End');
    assert.ok((await page.locator('#viewports').getAttribute('class')).includes('shot'));
    await page.keyboard.press('ArrowLeft');
    assert.ok((await page.locator('#viewports').getAttribute('class')).includes('split'));
    const selectedColors=await page.locator('.view-modes button.active').evaluate(el=>({color:getComputedStyle(el).color,background:getComputedStyle(el).backgroundColor}));
    assert.notEqual(selectedColors.color,selectedColors.background,'selected view remains legible');
    await page.locator('#resource-home').click();await page.locator('.asset-card').first().waitFor();
    await page.waitForFunction(()=>parseInt(document.querySelector('.library-grid').style.gridTemplateColumns.match(/repeat\((\d+)/)?.[1])>=2);
    assert.equal(await page.locator('[data-act=staging-open]:visible').count(),1);
    const permitted=await page.locator('.asset-card').first().evaluate(el=>el.dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:new DataTransfer()})));
    assert.equal(permitted,true,'asset drag is preserved');
    await page.evaluate(()=>document.dispatchEvent(new DragEvent('dragend',{bubbles:true})));
    await page.locator('[data-side=motions]').click();await page.locator('.motion-browser').waitFor();
    await page.locator('[data-side=scene]').click();assert.equal(await page.locator('#resource-tabs').isVisible(),false);
    await page.locator('#resource-home').click();assert.equal(await page.locator('[data-side=motions]').getAttribute('class'),'active');
    await page.locator('[data-side=assets]').click();await page.screenshot({path:`${out}/resources.png`});
    await page.locator('[data-side=scene]').click();
    assert.equal(await page.locator('.topbar').evaluate(el=>el.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}))),false);
    assert.equal(await page.locator('.brand').evaluate(el=>el.dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true}))),false);
    const b=await page.locator('.side-tabs').boundingBox();await page.mouse.move(b.x+5,b.y+10);await page.mouse.down();await page.mouse.move(b.x+b.width-5,b.y+10,{steps:6});await page.mouse.up();
    assert.equal(await page.evaluate(()=>getSelection().toString()),'','chrome labels do not select during a drag');
    await page.locator('.scene-switcher [data-act=production-prompt]').click();
    const field=page.locator('#production-prompt-text');await field.fill('Copy and paste');
    await field.evaluate(el=>{el.focus();el.setSelectionRange(0,4);});
    await field.click({button:'right',position:{x:20,y:12}});await page.locator('[data-context-command=text-copy]').click();
    assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'Copy');
    await field.evaluate(el=>{el.focus();el.setSelectionRange(0,4);});await field.click({button:'right',position:{x:20,y:12}});await page.locator('[data-context-command=text-cut]').click();
    assert.equal(await field.inputValue(),' and paste');await page.keyboard.press('Control+z');assert.equal(await field.inputValue(),'Copy and paste');
    await page.evaluate(()=>navigator.clipboard.writeText('New'));
    await field.evaluate(el=>{el.focus();el.setSelectionRange(0,4);});await field.click({button:'right',position:{x:20,y:12}});await page.locator('[data-context-command=text-paste]').click();
    await page.waitForFunction(()=>document.querySelector('#production-prompt-text').value==='New and paste');
    await field.click({button:'right',position:{x:20,y:12}});await page.locator('[data-context-command=text-selectAll]').click();
    assert.deepEqual(await field.evaluate(el=>[el.selectionStart,el.selectionEnd]),[0,13]);
    await page.locator('[data-act=close-modal]').first().click();
    const entityCount=await page.evaluate(()=>window.__director.getProject().entities.length);
    await page.locator('#ai-tools-toggle').click();assert.equal(await page.locator('#ai-changes-toggle').isVisible(),true);
    await page.keyboard.press('Delete');assert.equal(await page.evaluate(()=>window.__director.getProject().entities.length),entityCount,'an open application menu prevents background edits');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#ai-tools-toggle').evaluate(el=>el===document.activeElement),true,'Escape restores AI menu trigger focus');
    await page.evaluate(()=>document.querySelector('#settings-toggle').click());await page.locator('#ui-language').selectOption('en');await page.locator('[data-act=close-modal]').first().click();
    for(const [width,height] of [[1600,1000],[1280,720],[1000,720]]) {
        await page.setViewportSize({width,height});
        await page.screenshot({path:`${out}/english-${width}.png`});
        const bounds=await page.evaluate(()=>[...document.querySelectorAll('.topbar button,.topbar select,.view-toolbar button')].filter(el=>el.getClientRects().length).map(el=>({text:el.textContent,r:el.getBoundingClientRect().toJSON()})));
        for(const {text,r} of bounds) assert.ok(r.x>=0&&r.right<=width+1&&r.bottom<=height,`visible control outside window: ${text} at ${width}`);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no page horizontal overflow');
    }
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await page.locator('#ai-toggle').evaluate(el=>getComputedStyle(el).transitionDuration),'0s');
    assert.deepEqual(errors,[]);console.log('PASS: workbench navigation, resources, preserved drag, text copy/cut/paste/undo, context menus, English responsive layout and reduced motion');
} finally {await browser.close();}
