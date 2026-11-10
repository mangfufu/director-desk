import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
await fs.mkdir('tmp/curve-changes', { recursive: true });
const server = await createServer({ server: { host: '127.0.0.1', port: 0, watch: { ignored: ['**/tmp/**'] } } });
await server.listen(); let browser;
try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } }), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`); await page.waitForFunction(() => window.__director);
    await page.evaluate(() => { window.__qaErrors = []; new MutationObserver(rs => { for (const r of rs) for (const n of r.addedNodes) if (n instanceof Element && n.matches('.toast.error')) window.__qaErrors.push(n.textContent); }).observe(document.querySelector('#toasts'), { childList: true }); });
    const ids = await page.evaluate(async () => {
        const { demoProject } = await import('/src/model.ts'); const p = demoProject(); p.duration = 20;
        const actor = p.entities.find(e => e.kind === 'actor'), camera = p.entities.find(e => e.camera);
        actor.clips = []; actor.path = { smooth: false, points: [{ time: 0, position: [0, 0, 0] }, { time: 10, position: [4, 0, 0] }] };
        camera.camera.effects = { channels: { focal: { keys: [{ time: 0, value: 28 }, { time: 10, value: 50 }] } } };
        window.__director.replaceProject(p); await window.__director.callTool('director_view', { time: 5, entityId: actor.id });
        return { actor: actor.id, camera: camera.id, scene: (await window.__director.callTool('director_read')).data.sceneContext.sceneId };
    });
    const fits = async () => {
        const outside = await page.locator('#inspector-content').evaluate(root => { const b = root.getBoundingClientRect(); return [...root.querySelectorAll('button,select,svg')].filter(e => e.getClientRects().length).filter(e => { const r = e.getBoundingClientRect(); return r.right > b.right + 1 || r.left < b.left - 1; }).map(e => e.id || e.textContent); });
        assert.deepEqual(outside, []);
    };
    await page.locator('[data-timeline-view="curves"]').click(); await fits();
    assert.equal(await page.locator('#scrubber').count(), 0);
    assert.equal(await page.locator('#timeline-curves #curve-graph').count(), 1);
    assert.equal(await page.locator('#inspector-content #curve-graph').count(), 0);
    const drag = async () => {
        const handle = await page.locator('[data-curve-handle="0"]').boundingBox(), point = await page.locator('#curve-graph').evaluate(svg => { const p = new DOMPoint(220, 146).matrixTransform(svg.getScreenCTM()); return { x: p.x, y: p.y }; });
        await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down(); await page.mouse.move(point.x, point.y, { steps: 8 }); await page.mouse.up();
    };
    await drag();
    const getCurve = () => page.evaluate(id => window.__director.getProject().entities.find(e => e.id === id).path.points[1].easing, ids.actor);
    assert.ok((await getCurve()).bezier[0] > .7);
    await page.locator('[data-menu="edit"]').click();await page.locator('[data-act="undo"]').click(); assert.equal(await getCurve(), undefined);
    await page.locator('[data-menu="edit"]').click();await page.locator('[data-act="redo"]').click(); assert.ok((await getCurve()).bezier);
    await page.locator('[data-timeline-view="curves"]').click(); await page.screenshot({ path: 'tmp/curve-changes/curve.png' });
    // Cancellation must not create an edit.
    await page.locator('[data-act="curve-pause"]').click(); assert.equal(await page.evaluate(id=>window.__director.getProject().entities.find(e=>e.id===id).path.points.length,ids.actor),3); await page.locator('[data-menu="edit"]').click();await page.locator('[data-act="undo"]').click(); await page.locator('[data-timeline-view="curves"]').click();
    const previous = await getCurve(), handle = await page.locator('[data-curve-handle="1"]').boundingBox();
    await page.mouse.move(handle.x + 5, handle.y + 5); await page.mouse.down(); await page.mouse.move(handle.x - 50, handle.y + 15); await page.keyboard.press('Escape'); await page.mouse.up(); assert.deepEqual(await getCurve(), previous);
    // Camera channel curves use the same editor and survive editing another key property.
    await page.evaluate(id => window.__director.callTool('director_view', { time: 5, entityId: id }), ids.camera);
    await page.locator('[data-timeline-view="curves"]').click(); await page.locator('#curve-channel').selectOption('camera:focal'); await drag();
    await page.locator('[data-inspect="camera"]').click(); await page.locator('#cinema-key').selectOption('1');
    assert.equal(await page.locator('#cinema-ease').inputValue(), 'custom'); await page.locator('#cinema-value').fill('55'); await page.locator('[data-act="cinema-key-save"]').click();
    assert.ok(await page.evaluate(id => window.__director.getProject().entities.find(e => e.id === id).camera.effects.channels.focal.keys[1].easing.bezier, ids.camera));
    const result = await page.evaluate(async ids => {
        const api = window.__director, call = async (n, a) => { const r = await api.callTool(n, a); if (!r.ok) throw Error(r.error); return r.data; };
        const { readEdits } = await import('/src/automation/edit-journal.ts');
        let read = await call('director_read');
        const args = { revision: read.revision, requestId: 'preview', preview: true, operations: [{ operation: 'update', id: ids.actor, patch: { clips: [{ id: 'qa-run', start: 8, end: 12, action: 'run', speed: 1 }] } }] };
        await call('director_apply', args); const before = (await readEdits([ids.scene])).length;
        const commit = { ...args, requestId: 'commit', preview: false }; const applied = await call('director_apply', commit); await call('director_apply', commit);
        const records = await readEdits([ids.scene]); if (records.length !== before + 1) throw Error('Preview or retry created duplicate receipts');
        const failed = await api.callTool('director_apply', { revision: applied.revision, requestId: 'invalid', operations: [{ operation: 'update', id: 'missing', patch: { name: 'No' } }] });
        if (failed.ok || (await readEdits([ids.scene])).length !== records.length) throw Error('Failed edit was recorded');
        const snapshot=JSON.stringify(api.getDocument());
        const badCamera=await api.callTool('director_apply',{revision:applied.revision,requestId:'bad-camera-field',operations:[{operation:'update',id:ids.camera,patch:{camera:{focal:500}}}]});
        if(badCamera.ok || !/camera\.focal.*8—300/.test(badCamera.error) || !badCamera.error.includes(ids.camera))throw Error('Missing camera field diagnostic');
        if(JSON.stringify(api.getDocument())!==snapshot || (await readEdits([ids.scene])).length!==records.length)throw Error('Invalid camera changed project or receipt');
        read = await call('director_read'); const created = await call('director_scene', { action: 'copy', name: 'Second scene', revision: read.revision, requestId: 'copy' });
        return { receipt: records[0].id, second: created.sceneContext.sceneId };
    }, ids);
    await page.locator('#ai-changes-toggle').click(); await page.locator('#ai-change-batch').selectOption(result.receipt); await fits();
    await page.screenshot({ path: 'tmp/curve-changes/ai-changes.png' });
    await page.locator('[data-change-location]').filter({ hasText: '动作' }).click();
    const located = await page.evaluate(async () => (await window.__director.callTool('director_read')).data);
    assert.equal(located.sceneContext.sceneId, ids.scene); assert.equal(located.selectedId, ids.actor); assert.equal(located.time, 8);
    const selection=await page.evaluate(async()=>(await window.__director.callTool('director_read',{sections:['selection']})).data.selection);
    assert.deepEqual(selection.clips.map(c=>({kind:c.kind,id:c.id,start:c.start,end:c.end})),[{kind:'action',id:'qa-run',start:8,end:12}]);
    assert.deepEqual(selection.timeRange,{start:8,end:12});
    assert.equal(await page.locator('.timeline-clip[data-clip-id="qa-run"]').getAttribute('aria-selected'),'true');
    assert.equal(await page.locator('.timeline-selection-range').innerText(),'8.00–12.00s');
    errors.push(...await page.evaluate(()=>window.__qaErrors));
    // Local receipt survives reload without modifying or exporting the scene document.
    await page.waitForTimeout(700); page.on('dialog', d => d.accept()); await page.reload(); await page.waitForFunction(() => window.__director);
    await page.locator('#ai-changes-toggle').click(); await page.waitForSelector('#ai-change-batch');
    assert.ok((await page.locator('#ai-change-batch option').evaluateAll(es => es.map(e => e.value))).includes(result.receipt));
    errors.push(...await page.evaluate(() => window.__qaErrors ?? [])); assert.deepEqual(errors, []);
    console.log('Curve dragging, undo/redo, cancellation, channel preservation, inline layout, committed-only receipts, cross-scene positioning and local reload passed.');
} finally { await browser?.close(); await server.close(); }
