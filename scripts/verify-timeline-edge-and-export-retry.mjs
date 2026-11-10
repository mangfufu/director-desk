import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';

const server=await createServer({server:{host:'127.0.0.1',port:0}});await server.listen();
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
    const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);await page.waitForFunction(()=>window.__director);
    await page.evaluate(async()=>{
        const {createScene}=await import('/src/scenes.ts');const {entity}=await import('/src/model.ts');
        const p=createScene('blank');const actor=entity('actor','person','移动测试');actor.clips=[{id:'edge-test',start:1,end:3,action:'walk',speed:1}];
        p.entities.push(actor);p.duration=30;window.__director.replaceProject(p);
    });
    const root=page.locator('#timeline-content');
    const initial=await root.evaluate(e=>({width:e.scrollWidth,extent:document.querySelector('.ruler').dataset.duration}));
    await root.evaluate(e=>e.scrollLeft=e.scrollWidth);await page.waitForTimeout(100);
    assert.deepEqual(await root.evaluate(e=>({width:e.scrollWidth,extent:document.querySelector('.ruler').dataset.duration})),initial,'native scrollbar reaching end never resizes its own range');
    await root.evaluate(e=>e.scrollLeft=0);
    const box=await root.boundingBox(),ruler=await page.locator('.ruler').boundingBox(),right=box.x+box.width-20;
    await page.mouse.move(ruler.x+100,ruler.y+10);await page.mouse.down();await page.mouse.move(right,ruler.y+10);
    await page.waitForTimeout(350);
    let state=await page.evaluate(x=>{
        const r=document.querySelector('.timeline-playhead-overlay .playhead-line').getBoundingClientRect();return {scroll:document.querySelector('#timeline-content').scrollLeft,error:Math.abs(r.left-x)};
    },right);
    assert(state.scroll>70,'edge gesture scrolls the content');assert(state.error<3,'playhead remains under pointer while content scrolls: '+JSON.stringify(state));
    await page.mouse.move(box.x+box.width/2,ruler.y+10);await page.waitForTimeout(50);
    const stopped=await root.evaluate(e=>e.scrollLeft);await page.waitForTimeout(160);assert.equal(await root.evaluate(e=>e.scrollLeft),stopped,'leaving edge stops scrolling');
    await page.mouse.up();assert.equal(await page.evaluate(()=>document.documentElement.dataset.timelineDrag),undefined);
    await root.evaluate(e=>e.scrollLeft=0);
    const clip=page.locator('[data-clip-id="edge-test"]'),c=await clip.boundingBox(),grab=30;
    await page.mouse.move(c.x+grab,c.y+10);await page.mouse.down();await page.mouse.move(right,c.y+10);await page.waitForTimeout(300);
    const dragged=await page.locator('.timeline-drag-floating').boundingBox();assert(Math.abs(dragged.x+grab-right)<3,'floating clip grab point stays attached to pointer');
    await page.mouse.up();const released=await root.evaluate(e=>e.scrollLeft);await page.waitForTimeout(140);assert.equal(await root.evaluate(e=>e.scrollLeft),released);
    // Permission denial must retain settings and permit a successful retry.
    await page.evaluate(()=>{
        window.__pickerAttempts=0;
        window.showSaveFilePicker=async()=>{window.__pickerAttempts++;window.__pickerActivated=navigator.userActivation.isActive;
            return {createWritable:async()=>{if(window.__pickerAttempts===1)throw new DOMException('denied','NotAllowedError');return new WritableStream({write(){},close(){window.__writeClosed=true;}});}};};
    });
    await page.locator('[data-menu=file]').click();await page.locator('.header-actions [data-act=export]').click();
    await page.locator('#export-name').fill('保留文件名');await page.locator('#export-end').fill('.25');await page.locator('#export-size').selectOption('640');await page.locator('#export-save').selectOption('disk');
    await page.locator('[data-act=export-start]').click();
    await page.waitForFunction(()=>document.querySelector('#toasts')?.textContent.includes('无法写入') && document.querySelector('[data-act=export-start]')?.disabled===false);
    assert.equal(await page.locator('#export-name').inputValue(),'保留文件名');assert(await page.evaluate(()=>window.__pickerActivated));
    assert.match(await page.locator('#toasts').textContent(),/无法写入/);
    await page.locator('[data-act=export-start]').click();await page.waitForSelector('.export-modal',{state:'detached',timeout:60000});
    assert(await page.evaluate(()=>window.__writeClosed));assert.deepEqual(errors,[]);
    console.log('Stable scrollbar range, anchored playhead/clip edge scrolling, release cleanup, export permission failure and successful retry passed.');
} finally {await browser.close();await server.close();}
