import assert from 'node:assert/strict';
export async function verifyWorkspace(page, baseline) {
    const restore = () => page.evaluate(p => {window.__director.replaceProject(p); document.querySelector("#timeline-content").scrollLeft=0;}, baseline);
    const time = () => page.evaluate(() => window.__director.getEngine().time);
    const project = () => page.evaluate(() => window.__director.getProject());
    const near = (a, b, tolerance = .08) => assert.ok(Math.abs(a - b) < tolerance, `${a} should be close to ${b}`);
    await restore();
    const ruler = await page.locator('.ruler').boundingBox();
    await page.mouse.move(ruler.x + 60 * 1.5, ruler.y + 10);
    await page.mouse.down();
    await page.mouse.move(ruler.x + 60 * 9, ruler.y + 10, { steps: 8 });
    near(await time(), baseline.duration * .6);
    await page.mouse.move(ruler.x - 20, ruler.y + 10);
    near(await time(), 0);
    await page.mouse.up();
    assert.deepEqual(await project(), baseline);
    await page.locator('#timeline-mode').selectOption('preview');
    const lane = await page.locator('.track-lane').first().boundingBox();
    await page.mouse.move(lane.x + 60 * 6, lane.y + 10);
    near(await time(), baseline.duration * .4);
    await page.mouse.down(); await page.mouse.move(lane.x + 60 * 10.5, lane.y + 10, { steps: 5 }); await page.mouse.up();
    near(await time(), baseline.duration * .7);
    assert.deepEqual(await project(), baseline, 'Preview mode never edits clips');
    await page.locator('#timeline-mode').selectOption('edit');
    const stopped = await time();
    await page.mouse.move(lane.x + 60 * 3, lane.y + 10);
    near(await time(), stopped);

    await page.locator('[data-view="split"]').click();
    await page.locator('#stage-canvas canvas').click({position:{x:40,y:80}});
    const view = () => page.evaluate(() => { const e=window.__director.getEngine(); return {position:e.editorCamera.position.toArray(), target:e.orbit.target.toArray()}; });
    const originalView = await view();
    await page.keyboard.down('w');
    await page.waitForFunction(before => window.__director.getEngine().editorCamera.position.distanceTo({x:before[0],y:before[1],z:before[2]}) > .15, originalView.position);
    await page.keyboard.up('w');
    const walked = await view(); assert.notDeepEqual(walked.position, originalView.position);
    await page.keyboard.down('q');
    await page.waitForFunction(before => window.__director.getEngine().orbit.target.distanceTo({x:before[0],y:before[1],z:before[2]}) > .15, walked.target);
    await page.keyboard.up('q');
    assert.deepEqual(await project(), baseline, 'Navigation must not move filming cameras or assets');
    const camera = baseline.entities.find(e => e.kind === 'camera');
    await page.locator(`[data-select="${camera.id}"]`).first().click();
    const field = page.locator('[data-field="camera.focal"]');
    await field.focus(); const beforeTyping = await view();
    await page.keyboard.down('w'); await page.waitForTimeout(120); await page.keyboard.up('w');
    assert.deepEqual(await view(), beforeTyping, 'Input fields cannot navigate');
    await page.locator('[data-view="shot"]').click(); const shotView = await view();
    await page.keyboard.down('w'); await page.waitForTimeout(120); await page.keyboard.up('w');
    assert.deepEqual(await view(), shotView, 'Shot-only mode cannot navigate');
    await page.locator('[data-view="split"]').click();

    const dimensions = () => page.evaluate(() => ({
        left:document.querySelector('.sidebar').getBoundingClientRect().width,
        right:document.querySelector('.inspector').getBoundingClientRect().width,
        height:document.querySelector('.timeline').getBoundingClientRect().height,
        split:document.querySelector('.stage-panel').getBoundingClientRect().width
    }));
    const originalDimensions = await dimensions();
    for (const [key, dx, dy] of [['sidebar', 50, 0], ['inspector', -40, 0], ['timeline', 0, -70], ['split', 80, 0]]) {
        const h = await page.locator(`[data-boundary="${key}"]`).boundingBox();
        await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await page.mouse.down();
        await page.mouse.move(h.x + h.width / 2 + dx, h.y + h.height / 2 + dy, { steps:5 }); await page.mouse.up();
    }
    const resized = await dimensions();
    near(resized.left - originalDimensions.left, 50, 2); near(resized.right - originalDimensions.right, 40, 2); near(resized.height - originalDimensions.height, 70, 2);
    assert.ok(resized.split > originalDimensions.split);
    await page.screenshot({path:'tmp/smoke/05-resized.png'});
    await page.reload({waitUntil:'networkidle'});
    await page.waitForFunction(() => !!window.__director);
    const persisted = await dimensions();
    for (const key of ['left','right','height','split']) near(persisted[key], resized[key], 2);
    await page.locator('#reset-layout').click();

    for (const template of ['park','street','courtyard','room','blank']) {
        await page.locator('[data-act="scene-templates"]').click();
        await page.locator(`input[name="scene-template"][value="${template}"]`).check();
        await page.locator('[data-act="confirm-new"]').click();
        const p = await project();
        assert.equal(p.room.enabled, template === 'room');
        assert.ok(p.entities.some(e => e.kind === 'camera'));
        if (template !== 'room') assert.ok(p.entities.some(e => e.asset === 'ground'));
        if (template === 'street') await page.screenshot({path:'tmp/smoke/06-street.png'});
    }
    await page.locator('#resource-home').click(); await page.locator('[data-side="assets"]').click();
    await page.locator('#asset-category').selectOption('室外'); await page.locator('#search').fill('building');
    await page.locator('[data-asset="building"]').click();
    const building = (await project()).entities.find(e => e.asset === 'building'); assert.ok(building);
    await page.locator('[data-field="pos.0"]').fill('4'); await page.locator('[data-field="pos.0"]').press('Tab');
    await page.locator('[data-field="scale.1"]').fill('1.5'); await page.locator('[data-field="scale.1"]').press('Tab');
    const built = await project(); const edited = built.entities.find(e => e.id === building.id);
    assert.equal(edited.position[0], 4); assert.equal(edited.scale[1], 1.5);
    await page.evaluate(p => window.__director.replaceProject(p), built);
    assert.deepEqual(await project(), built, 'Custom outdoor scene survives project validation');
    await page.locator('[data-side="scene"]').click(); await restore();
    console.log('Verified timeline drag/hover, keyboard navigation, resizable persistent layout, five new scenes and custom building.');
}
