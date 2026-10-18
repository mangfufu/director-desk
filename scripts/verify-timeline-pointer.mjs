import assert from 'node:assert/strict';

// Exercise WSLg's split stream: mouse press/up ID 1, pen motion ID 2.
export async function verifyTimelinePointer(page) {
    const root=page.locator('#timeline-content');
    await page.locator('#timeline-mode').selectOption('edit');
    await page.locator('#timeline-zoom').selectOption('1');
    await root.evaluate(el=>{el.scrollLeft=0;});
    const r=await page.locator('.ruler').boundingBox();
    await page.evaluate(()=>{
        const proto=WebGL2RenderingContext.prototype,original=proto.drawElements;
        window.__pointerDraws=0;
        proto.drawElements=function(...args){window.__pointerDraws++;return original.apply(this,args);};
        window.__restorePointerDraws=()=>{proto.drawElements=original;delete window.__pointerDraws;};
        window.__splitMouseMove=e=>{
            if(!e.isTrusted || !(e.buttons&1))return;
            e.stopImmediatePropagation();
            e.target.dispatchEvent(new PointerEvent('pointermove',{
                bubbles:true,clientX:e.clientX,clientY:e.clientY,buttons:e.buttons,
                pointerId:window.directorDesktop?.wslPointerInput?e.pointerId+1:e.pointerId,
                pointerType:window.directorDesktop?.wslPointerInput?'pen':e.pointerType,isPrimary:e.isPrimary,
            }));
        };
        document.addEventListener('pointermove',window.__splitMouseMove,true);
    });
    const time=()=>page.locator('#timecode').innerText();
    try {
        await page.mouse.move(r.x+60,r.y+8);await page.mouse.down();
        let previous=await time();
        for(let i=1;i<=8;i++) {
            const draws=await page.evaluate(()=>window.__pointerDraws);
            await page.mouse.move(r.x+60+i*24,r.y+8);
            const next=await time();
            assert.notEqual(next,previous,'timecode must update before mouse release despite changed pointer ID');
            previous=next;
            await page.waitForFunction(before=>window.__pointerDraws>before,draws,{timeout:2000});
        }
        // An unrelated touch/pen must not seize the current mouse drag.
        for(const pointerType of ['touch','pen']) {
            await root.dispatchEvent('pointerdown',{pointerId:99,pointerType,isPrimary:true,button:0,buttons:1,clientX:r.x+480,clientY:r.y+8});
            await root.dispatchEvent('pointermove',{pointerId:99,pointerType,isPrimary:true,buttons:1,clientX:r.x+480,clientY:r.y+8});
            assert.equal(await time(),previous,`${pointerType} cannot move a mouse drag`);
        }
        await page.mouse.up();
        assert.equal(await root.evaluate(()=>document.documentElement.dataset.timelineDrag),undefined);
        await page.mouse.move(r.x+420,r.y+8);
        assert.equal(await time(),previous,'release must end mouse tracking');
        await page.mouse.down();
        await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
        assert.equal(await root.evaluate(()=>document.documentElement.dataset.timelineDrag),undefined);
        const cancelled=await time();await page.mouse.move(r.x+480,r.y+8);
        assert.equal(await time(),cancelled,'blur must end the drag');await page.mouse.up();
    } finally {
        await page.mouse.up();
        await page.evaluate(()=>{document.removeEventListener('pointermove',window.__splitMouseMove,true);delete window.__splitMouseMove;window.__restorePointerDraws();delete window.__restorePointerDraws;});
    }
    console.log('PASS: split mouse IDs update timecode and 3D before release; pen/touch isolation, release and blur cleanup');
}
