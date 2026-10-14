import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const output='output/playwright/language'; await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
    const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(process.env.DIRECTOR_URL||'http://127.0.0.1:5178');
    await page.waitForFunction(()=>window.__director);
    await page.evaluate(()=>document.querySelector('#settings-toggle').click());
    await page.locator('#ui-language').selectOption('en');
    await page.waitForFunction(()=>document.documentElement.lang==='en');
    assert.equal(await page.locator('[data-settings-category="navigation"]').innerText(),'Navigation');
    await page.screenshot({path:`${output}/settings.png`});
    await page.locator('[data-act="close-modal"]') .first().click();
    await page.screenshot({path:`${output}/workspace.png`});
    const collect=()=>page.evaluate(()=>{
        const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT),texts=new Set();
        let n;while(n=walker.nextNode())if(/[\u3400-\u9fff]/.test(n.textContent)&&n.parentElement?.checkVisibility()&&!n.parentElement.closest('script,style,textarea,[data-i18n-ignore],#object-labels,.object-name,#scene-switch,#shot-name'))texts.add(n.textContent.trim());return [...texts];
    });
    console.log('Workspace untranslated:',await collect());
    for(const scope of ['scene','selection']){
        await page.locator(`[data-inspector-scope="${scope}"]`).click();
        console.log(scope,await collect());
    }
    await page.evaluate(async()=>{
        const {createScene}=await import('/src/scenes.ts'),{entity}=await import('/src/model.ts');
        const p=createScene('blank');p.name='保存';const e=entity('actor','human-adult','动作');e.id='language-actor';p.entities.push(e);window.__director.replaceProject(p);
    });
    const before=await page.evaluate(()=>JSON.stringify(window.__director.getProject()));
    await page.locator('.object-row[data-select="language-actor"]').click();
    assert.equal(await page.locator('#inspector-header h2').innerText(),'动作');
    for(const tab of ['base','actions','path']) {
        const target=page.locator(`[data-inspect="${tab}"]`);if(await target.count())await target.click();
        console.log(tab,await collect());
    }
    for(const tab of ['surface','physics','hand']) {
        const target=page.locator(`[data-inspect="${tab}"]`);if(await target.count())await target.click();
        console.log(tab,await collect());
    }
    for(const side of ['assets','motions']) {
        await page.locator(`[data-side="${side}"]`).click();console.log(side,await collect());
    }
    await page.locator('#search').fill('walk');
    assert.ok(await page.locator('[data-library-motion="basic-walk"]').count());
    await page.locator('[data-side="assets"]').click();await page.locator('#search').fill('coffee table');
    assert.ok(await page.locator('[data-asset="furniture-coffeetable"]').count());
    await page.locator('#search').fill('');await page.locator('[data-side="scene"]').click();
    const cameraId=await page.evaluate(()=>window.__director.getProject().entities.find(e=>e.kind==='camera').id);
    await page.locator(`.object-row[data-select="${cameraId}"]`).click();
    console.log('camera',await collect());
    assert.equal(await page.locator('[data-framing="全景"]').innerText(),'Full Shot');
    assert.equal(await page.locator('[data-framing="全景"]').getAttribute('data-framing'),'全景');
    await page.locator('.header-actions [data-act="export"]').click();
    console.log('export',await collect());await page.screenshot({path:`${output}/export.png`});
    const options=await page.locator('#export-color option').evaluateAll(els=>els.map(e=>e.value));assert.deepEqual(options,['color','white','depth']);
    await page.locator('[data-act="close-modal"]').first().click();
    await page.locator('#ai-toggle').click();console.log('ai',await collect());
    // The browser edition keeps the desktop-only assistant disabled.
    await page.locator('#ai-prompt').evaluate(el=>{el.value='保存\n动作与台词保持原文';});
    await page.locator('#ai-close').click();
    await page.setViewportSize({width:1280,height:720});
    await page.screenshot({path:`${output}/workspace-1280.png`});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'workspace fits viewport');
    await page.locator('[data-act="play"]').click();await page.waitForFunction(()=>document.querySelector('[data-act="play"]').getAttribute('aria-label')==='Pause');await page.locator('[data-act="play"]').click();
    await page.evaluate(()=>document.querySelector('#settings-toggle').click());
    await page.locator('#ui-language').selectOption('zh-CN');
    assert.equal(await page.locator('[data-settings-category="navigation"]').innerText(),'操作与视角');
    await page.locator('#ui-language').selectOption('en');
    await page.locator('[data-act="close-modal"]') .first().click();
    assert.equal(await page.evaluate(()=>JSON.stringify(window.__director.getProject())),before);
    assert.equal(await page.locator('#ai-prompt').inputValue(),'保存\n动作与台词保持原文');
    await page.reload();await page.waitForFunction(()=>window.__director);
    assert.equal(await page.locator('html').getAttribute('lang'),'en');
    assert.deepEqual(errors,[]);console.log('PASS: switch, restore, persistence, content preservation');
}finally{await browser.close();}
