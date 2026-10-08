import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
await fs.mkdir('tmp/groups', { recursive: true });
const server = await createServer({ server: { host: '127.0.0.1', port: 0, watch: { ignored: ['**/tmp/**', '**/.audit/**'] } } });
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } }), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`); await page.waitForFunction(() => window.__director);
    await page.evaluate(async () => {
        const { createScene } = await import('/src/scenes.ts'), { entity } = await import('/src/model.ts');
        const p = createScene('blank');
        const a = entity('prop', 'cube', '方块 A', [-1, 0, 0]), b = entity('prop', 'cube', '方块 B', [1, 0, 0]); a.id = 'a'; b.id = 'b';
        p.entities.push(a, b); window.__director.replaceProject(p);
    });
    const object = id => page.locator(`.object-row[data-select="${id}"]`);
    await object('a').click(); await object('b').click({ modifiers: ['Control'] });
    assert.equal(await page.locator('.object-row.selected').count(), 2);
    await page.locator('#group-name').fill('组合测试'); await page.locator('#inspector-content [data-act="group-create"]').click();
    const project = () => page.evaluate(() => window.__director.getProject());
    let p = await project(); assert.deepEqual(p.groups[0].entityIds.sort(), ['a', 'b']);
    await page.locator('#group-move-0').fill('3'); await page.locator('#group-rotate-1').fill('90');
    await page.locator('[data-act="group-transform"]').click();
    p = await project(); assert.ok(Math.abs(p.entities.find(e => e.id === 'a').position[0] - 3) < 1e-8);
    assert.ok(Math.abs(p.entities.find(e => e.id === 'a').position[2] - 1) < 1e-8);
    await page.locator('#group-name').blur(); await page.keyboard.press('Control+z');
    assert.deepEqual((await project()).entities.find(e => e.id === 'a').position, [-1, 0, 0]);
    await page.locator('#scene-group-select').selectOption(p.groups[0].id);
    await page.locator('[data-act="group-copy"]').click(); p = await project(); assert.equal(p.groups.length, 2);
    await page.locator('#group-member').selectOption(p.groups[1].entityIds[0]); await page.locator('[data-act="group-edit-member"]').click();
    assert.equal(await page.locator('.group-panel').count(), 0);
    await page.locator('#scene-group-select').selectOption(p.groups[0].id);
    await page.locator('[data-view="stage"]').click();
    // Drive real canvas pointer events on the X handle; compare both members' deltas.
    const before = await project();
    const drag = await page.evaluate(() => {
        const e = window.__director.getEngine(); e.setTransformMode('translate'); e.viewTop(); e.render();
        const c = e.editorRenderer.domElement, rect = c.getBoundingClientRect();
        const pos = e.proxy.position.clone().project(e.editorCamera);
        return { x: rect.x + (pos.x * .5 + .5) * rect.width, y: rect.y + (-pos.y * .5 + .5) * rect.height };
    });
    await page.mouse.move(drag.x + 35, drag.y); await page.mouse.down(); await page.mouse.move(drag.x + 100, drag.y, { steps: 8 }); await page.mouse.up();
    const after = await project(), delta = id => after.entities.find(e => e.id === id).position.map((v, i) => v - before.entities.find(e => e.id === id).position[i]);
    assert.ok(Math.abs(delta('a')[0]) > .01, 'canvas drag must actually move the group');
    assert.ok(delta('a').every((v, i) => Math.abs(v - delta('b')[i]) < 1e-8));
    await page.screenshot({ path: 'tmp/groups/group-inspector.png' });
    for (const width of [1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const overflow = await page.locator('.group-panel').evaluate(el => el.scrollWidth > el.clientWidth + 1); assert.equal(overflow, false);
    }
    await page.evaluate(() => { const api = window.__director; api.replaceProject(JSON.parse(JSON.stringify(api.getDocument()))); });
    assert.equal((await project()).groups.length, 2);
    await page.evaluate(async () => {
        const { createScene } = await import('/src/scenes.ts'), { entity } = await import('/src/model.ts');
        const { defaultPhysicsBody } = await import('/src/physics/model.ts');
        const p = createScene('blank'), a = entity('prop', 'cube', 'A'), b = entity('prop', 'cube', 'B', [2, 0, 0]);
        a.id = 'a'; b.id = 'b'; a.physics = { ...defaultPhysicsBody(), velocity: [1, 0, 0], impulses: [{ time: 1, impulse: [1, 0, 0], point: [0, 0, 0] }] };
        p.entities.push(a, b); window.__director.replaceProject(p);
    });
    await object('a').click(); await object('b').click({ modifiers: ['Control'] });
    await page.evaluate(() => {
        const engine = window.__director.getEngine(); engine.setTransformMode('rotate');
        engine.gizmo.dispatchEvent({ type: 'mouseDown' });
        for (const angle of [Math.PI / 4, Math.PI / 2, Math.PI / 2]) {
            engine.proxy.rotation.set(0, angle, 0); engine.gizmo.dispatchEvent({ type: 'objectChange' });
        }
        engine.gizmo.dispatchEvent({ type: 'mouseUp' });
    });
    const physical = (await project()).entities.find(e => e.id === 'a').physics;
    for (const vector of [physical.velocity, physical.impulses[0].impulse]) assert.ok(Math.abs(vector[0]) < 1e-7 && Math.abs(vector[2] + 1) < 1e-7);
    await page.evaluate(async () => { const api = window.__director, read = await api.callTool('director_read', { sections: [] }); const result = await api.callTool('director_history', { action: 'undo', revision: read.data.revision }); if (!result.ok) throw Error(result.error); });
    assert.deepEqual((await project()).entities.find(e => e.id === 'a').physics.velocity, [1, 0, 0]);
    assert.deepEqual(errors, []);
    console.log('Group UI: create, select, transform, undo, copy, member editing, canvas drag, physics rotation/undo, save/reopen and layout passed.');
} finally { await browser.close(); await server.close(); }
