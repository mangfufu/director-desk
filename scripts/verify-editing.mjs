import assert from 'node:assert/strict';

export async function verifyEditing(page, baseline) {
    const restore = async (p = baseline) => { await page.evaluate(p => window.__director.replaceProject(p), p); await page.locator('[data-side="scene"]').click(); };
    const project = () => page.evaluate(() => window.__director.getProject());
    const select = id => page.locator(`[data-select="${id}"]`).first().click();
    const field = async (key, value) => { await page.locator(`[data-field="${key}"]`).fill(String(value)); await page.locator(`[data-field="${key}"]`).press('Tab'); };
    const actor = baseline.entities[1], pov = baseline.entities.find(e => e.camera?.mode === 'pov');
    await restore(); await select(actor.id); await page.locator('[data-inspect="base"]').click();
    await page.locator('[data-field="locked"]').selectOption('true');
    const locked = await project();
    assert.equal(await page.locator('[data-field="height"]').isDisabled(), true);
    await page.locator('[data-inspect="actions"]').click(); assert.equal(await page.locator('[data-add-action="wave"]').isDisabled(), true);
    await page.locator('[data-inspect="path"]').click();
    const bar = page.locator(`[data-path-id="${actor.id}"]`); await bar.scrollIntoViewIfNeeded();
    const rect = await bar.boundingBox(); await page.mouse.move(rect.x + 10, rect.y + 8); await page.mouse.down(); await page.mouse.move(rect.x + 80, rect.y + 8); await page.mouse.up();
    await page.locator('[data-select]').first().focus(); await page.keyboard.press('Delete');
    assert.deepEqual(await project(), locked, 'Locked objects resist timeline edits and keyboard deletion');
    await page.locator('[data-act="unlock-selected"]').click();
    assert.equal((await project()).entities.find(e => e.id === actor.id).locked, false);
    await page.locator('[data-inspect="base"]').click(); await field('height', 1.9); await page.locator('[data-act="undo"]').click();
    assert.equal((await project()).entities.find(e => e.id === actor.id).height, actor.height);

    await restore(); await select(pov.id); await page.evaluate(id => { window.__director.setPreview(id); window.__director.setTime(5); }, pov.id);
    const signature = () => page.evaluate(() => window.__director.signature());
    const before = await signature();
    await page.locator('[data-field="camera.mode"]').selectOption('free');
    const frozen = await signature();
    for (let i = 0; i < 16; i++) assert.ok(Math.abs(before.world[i] - frozen.world[i]) < 1e-7, 'Detach preserves world pose');
    await page.locator('[data-act="undo"]').click();
    assert.equal((await project()).entities.find(e => e.id === pov.id).camera.mode, 'pov');
    await select(pov.camera.targetId); await page.locator('[data-act="delete"]').click();
    const deleted = await project(); assert.ok(!deleted.entities.some(e => e.id === pov.camera.targetId));
    assert.equal(deleted.entities.find(e => e.id === pov.id).camera.mode, 'free');
    const afterDelete = await page.evaluate(id => window.__director.getEngine().projectionSignature(id), pov.id);
    for (let i = 0; i < 16; i++) assert.ok(Math.abs(before.world[i] - afterDelete.world[i]) < 1e-7, 'Deleting target preserves bound camera pose');
    await page.locator('[data-act="undo"]').click(); assert.deepEqual(await project(), baseline);

    await restore(); await select(actor.id); await page.locator('[data-inspect="path"]').click();
    await page.locator('[data-act="draw-path"]').click();
    await page.locator('[data-point="0"][data-axis="time"]').fill('9'); await page.locator('[data-point="0"][data-axis="time"]').press('Tab');
    assert.equal((await project()).entities.find(e => e.id === actor.id).path.points[0].time, 0, 'Draft cannot leak into a second edit transaction');
    await page.keyboard.press('Escape');
    // Escape from a field may only blur in some browsers; the explicit cancel remains available.
    if (await page.locator('[data-act="cancel-path"]').count()) await page.locator('[data-act="cancel-path"]').click();
    assert.deepEqual(await project(), baseline);
    await page.locator('[data-act="draw-path"]').click();
    const download = page.waitForEvent('download'); await page.locator('[data-act="save"]').click(); const saved = await download;
    const stream = await saved.createReadStream(); let json = ''; for await (const chunk of stream) json += chunk;
    assert.deepEqual(JSON.parse(json), baseline, 'Saving an incomplete path returns a valid project');

    await restore(); await select(actor.id); await page.locator('[data-inspect="base"]').click();
    await page.locator(`[data-select="${actor.id}"]`).first().focus(); await page.keyboard.press('Control+d');
    const copied = await project(); const copy = copied.entities.find(e => !baseline.entities.some(old => old.id === e.id));
    assert.ok(copy); assert.equal(copy.path.points[0].position[0], actor.path.points[0].position[0] + .4);
    await page.locator('[data-act="undo"]').click(); assert.deepEqual(await project(), baseline);

    await page.locator('#placement-snap').selectOption('0.5');
    await page.evaluate(() => window.__director.getEngine().orbit.target.set(.26, .8, .74));
    await page.locator('#resource-home').click(); await page.locator('[data-side="assets"]').click(); await page.locator('#asset-category').selectOption('搭建'); await page.locator('#search').fill('cube'); await page.locator('[data-asset="cube"]').click();
    const cube = (await project()).entities.find(e => e.asset === 'cube'); assert.deepEqual(cube.position, [.5, 0, .5]);
    await field('pos.1', 2); await page.locator('[data-act="ground-selected"]').click();
    assert.ok(Math.abs((await project()).entities.find(e => e.id === cube.id).position[1]) < .00001);
    await page.locator('#placement-snap').selectOption('0');

    await restore(); await page.locator('#timeline-zoom').selectOption('4');
    await page.evaluate(() => window.__director.setTime(10)); await page.locator('#timeline-center').click();
    assert.ok(await page.evaluate(() => document.querySelector('#timeline-content').scrollLeft > 500));
    const ruler = await page.locator('.ruler').boundingBox(), container = await page.locator('#timeline-content').boundingBox();
    const x = container.x + container.width * .6;
    await page.mouse.move(x, ruler.y + 10); await page.mouse.down(); await page.mouse.move(x + 80, ruler.y + 10); await page.mouse.up();
    const expected = Math.round((x + 80 - ruler.x) / ruler.width * Number(await page.locator(".ruler").getAttribute("data-duration")) * baseline.fps) / baseline.fps;
    assert.ok(Math.abs(await page.evaluate(() => window.__director.getEngine().time) - expected) < .001, 'Zoomed and horizontally scrolled seeking stays accurate');
    assert.deepEqual(await project(), baseline);
    await page.screenshot({path:'tmp/smoke/07-precise-editing.png'});
    await page.locator('#timeline-zoom').selectOption('1');
    console.log('Verified lock enforcement, camera detach/delete continuity, draft isolation, valid draft save, copy/undo, snap/ground placement and zoomed seeking.');
}
