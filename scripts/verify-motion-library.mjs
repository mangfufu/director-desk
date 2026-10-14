import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const output = 'output/playwright/motion-library';
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1560, height: 1000 } });
const errors = []; page.on('pageerror', error => errors.push(error.message));
page.on('dialog', dialog => dialog.accept());
try {
    await page.goto(process.env.DIRECTOR_URL || 'http://127.0.0.1:5178');
    await page.waitForFunction(() => !!window.__director);
    await page.evaluate(async () => {
        const { createScene } = await import('/src/scenes.ts');
        const { entity } = await import('/src/model.ts');
        const project = createScene('blank');
        const actor = entity('actor', 'human-adult', '动作测试人物'); actor.id = 'motion-target'; actor.clips = [];
        const locked = entity('actor', 'human-adult', '锁定人物'); locked.id = 'locked-target'; locked.locked = true; locked.clips = [];
        project.entities.push(actor, locked); window.__director.replaceProject(project);
    });
    const project = () => page.evaluate(() => window.__director.getProject());
    const count = () => page.evaluate(() => window.__director.getProject().entities.find(e => e.id === 'motion-target').clips.length);
    await page.locator('[data-side="motions"]').click();
    await page.locator('#search').fill('basic-wave');
    const source = page.locator('[data-library-motion="basic-wave"]');
    await source.waitFor();
    const lane = page.locator('[data-track-key="entity:motion-target"] .track-lane');
    // Repeated pointer events must not detach/recreate the drop overlay each time.
    const mutations = await page.evaluate(async () => {
        const source = document.querySelector('[data-library-motion="basic-wave"]');
        const lane = document.querySelector('[data-track-key="entity:motion-target"] .track-lane');
        const rect = lane.getBoundingClientRect(), dataTransfer = new DataTransfer();
        let mutations = 0;
        const observer = new MutationObserver(records => { mutations += records.length; });
        observer.observe(lane, { childList: true, subtree: true });
        source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer }));
        for (let i = 0; i < 240; i++) lane.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, clientX: rect.left + 120 + i % 80, clientY: rect.top + 18, dataTransfer }));
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        observer.disconnect(); source.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer }));
        return mutations;
    });
    assert.ok(mutations < 20, `drop preview coalesces events and reuses DOM (${mutations} mutations)`);
    await page.evaluate(() => {
        window.__motionRoot = window.__director.getEngine().models.get('motion-target');
        window.__motionPrepareCalls = 0;
        const models = window.__director.getEngine().externalModels, prepare = models.prepare;
        models.prepare = function (...args) { window.__motionPrepareCalls++; return prepare.apply(this, args); };
    });
    await source.dragTo(lane, { targetPosition: { x: 120, y: 18 } });
    await page.waitForFunction(() => window.__director.getProject().entities.find(e => e.id === 'motion-target').clips.length === 1);
    let clips = (await project()).entities.find(e => e.id === 'motion-target').clips;
    assert.deepEqual(clips.map(c => [c.action, c.start, c.end]), [['wave', 2, 5]]);
    assert.equal(await page.evaluate(() => window.__motionRoot === window.__director.getEngine().models.get('motion-target')), true, 'basic action retains the existing mannequin');
    assert.equal(await page.evaluate(() => window.__motionPrepareCalls), 0, 'basic action does not queue model loading');
    // Right half of an occupied interval: preview and commit insert after it.
    const sourceBox = await source.boundingBox(), laneBox = await lane.boundingBox();
    await page.mouse.move(sourceBox.x + 40, sourceBox.y + 20); await page.mouse.down();
    await page.mouse.move(sourceBox.x + 55, sourceBox.y + 25, { steps: 6 });
    await page.mouse.move(laneBox.x + 270, laneBox.y + 18, { steps: 12 });
    await page.mouse.move(laneBox.x + 271, laneBox.y + 18);
    await page.locator('.motion-drop-ghost').waitFor();
    assert.match(await page.locator('.motion-drop-status').innerText(), /5\.00—8\.00/);
    await page.screenshot({ path: `${output}/drop-preview.png` });
    await page.mouse.up();
    await page.waitForFunction(() => window.__director.getProject().entities.find(e => e.id === 'motion-target').clips.length === 2);
    clips = (await project()).entities.find(e => e.id === 'motion-target').clips;
    assert.deepEqual(clips.map(c => [c.start, c.end]), [[2, 5], [5, 8]]);
    assert.equal(await page.locator('.motion-drop-ghost').count(), 0);
    await page.keyboard.press('Delete'); assert.equal(await count(), 1, 'drop selects only the inserted clip for deletion');
    assert.ok((await project()).entities.some(e => e.id === 'motion-target'));
    await page.evaluate(() => document.querySelector('[data-act="undo"]').click());
    assert.equal(await count(), 2);
    await page.evaluate(() => document.querySelector('[data-act="undo"]').click());
    assert.equal(await count(), 1, 'one undo reverts one insertion');
    const beforeInvalid = await project();
    await source.dragTo(page.locator('[data-track-key="entity:locked-target"] .track-lane'), { targetPosition: { x: 120, y: 18 } });
    assert.deepEqual(await project(), beforeInvalid);
    await source.dragTo(page.locator('.cut-row .track-lane'), { targetPosition: { x: 120, y: 18 } });
    assert.deepEqual(await project(), beforeInvalid);
    // Scroll and zoom must not change the meaning of the drop coordinate.
    await page.locator('#timeline-zoom').selectOption('2');
    await page.evaluate(() => { document.querySelector('#timeline-content').scrollLeft = 600; });
    const x = await page.locator('.ruler').evaluate(el => el.getBoundingClientRect().left + 8 * 120);
    const b = await source.boundingBox(), l = await lane.boundingBox();
    await page.mouse.move(b.x + 40, b.y + 20); await page.mouse.down(); await page.mouse.move(b.x + 55, b.y + 25, { steps: 6 });
    await page.mouse.move(x, l.y + 18, { steps: 12 }); await page.mouse.move(x + 1, l.y + 18); await page.mouse.up();
    await page.waitForFunction(() => window.__director.getProject().entities.find(e => e.id === 'motion-target').clips.length === 2);
    assert.equal((await project()).entities.find(e => e.id === 'motion-target').clips[1].start, 8);
    // Save a real built-in resource to the user library, then apply its portable clip.
    await page.evaluate(async () => {
        const { includeMotionResources } = await import('/src/animation/motion-presets.ts');
        const { builtinMotionRig } = await import('/src/animation/motion-catalog.ts');
        const { saveUserMotion } = await import('/src/animation/user-motion-store.ts');
        const { userMotionId } = await import('/src/animation/user-motion.ts');
        const prepared = await includeMotionResources(window.__director.getProject());
        const resource = prepared.resources[0];
        await saveUserMotion({ id: userMotionId(resource.id, 0), name: '收藏测试动作', duration: 2, data: { resourceId: resource.id, index: 0, loop: true, unitScale: 1, orientation: [0, 0, 0], rig: builtinMotionRig() } }, resource);
    });
    await page.locator('#search').fill('收藏测试动作');
    const userMotion = page.locator('[data-library-motion^="user-motion:"]'); await userMotion.waitFor();
    await userMotion.dragTo(lane, { targetPosition: { x: 1440, y: 18 } });
    await page.waitForFunction(() => window.__director.getProject().entities.find(e => e.id === 'motion-target').clips.length === 3);
    assert.equal((await project()).entities.find(e => e.id === 'motion-target').clips[2].name, '收藏测试动作');
    assert.equal((await project()).resources.length, 1);
    // Edge scrolling continues with a stationary pointer; escape makes no edit.
    const userBox = await userMotion.boundingBox(), viewport = await page.locator('#timeline-content').boundingBox();
    await page.mouse.move(userBox.x + 40, userBox.y + 20); await page.mouse.down(); await page.mouse.move(userBox.x + 55, userBox.y + 25, { steps: 6 });
    await page.mouse.move(viewport.x + viewport.width - 5, l.y + 18, { steps: 12 }); await page.mouse.move(viewport.x + viewport.width - 4, l.y + 18);
    const scrollBefore = await page.locator('#timeline-content').evaluate(el => el.scrollLeft);
    await page.waitForFunction(before => document.querySelector('#timeline-content').scrollLeft > before + 100, scrollBefore);
    await page.keyboard.press('Escape'); await page.mouse.up();
    assert.equal(await count(), 3); assert.equal(await page.locator('.motion-drop-ghost').count(), 0);
    // While resources are preparing, playback is visibly disabled. Completion
    // stays paused; only an explicit click after completion starts playback.
    await page.locator('#timeline-zoom').selectOption('1');
    await page.evaluate(() => { document.querySelector('#timeline-content').scrollLeft = 0; window.__director.setTime(0); });
    for (const fail of [false, true]) {
        const before = await count();
        await page.evaluate(() => {
            const models = window.__director.getEngine().externalModels, prepare = models.prepare;
            window.__motionRelease = undefined;
            models.prepare = async function (...args) {
                models.prepare = prepare;
                await prepare.apply(this, args);
                await new Promise((resolve, reject) => { window.__motionRelease = fail => fail ? reject(Error('动作加载测试失败')) : resolve(); });
            };
        });
        await page.evaluate(() => { document.querySelector('#timeline-content').scrollLeft = 0; });
        const sourceRect = await userMotion.boundingBox(), targetRect = await lane.boundingBox();
        await page.mouse.move(sourceRect.x + 40, sourceRect.y + 20); await page.mouse.down();
        await page.mouse.move(sourceRect.x + 55, sourceRect.y + 25, { steps: 6 });
        await page.mouse.move(targetRect.x + 120, targetRect.y + 18, { steps: 12 });
        await page.mouse.move(targetRect.x + 121, targetRect.y + 18); await page.mouse.up();
        await page.waitForFunction(() => typeof window.__motionRelease === 'function');
        const play = page.locator('[data-act="play"]');
        assert.equal(await play.isDisabled(), true);
        await play.evaluate(el => el.click()); // Disabled clicks are never deferred.
        await page.evaluate(fail => window.__motionRelease(fail), fail);
        await page.waitForFunction(() => !document.querySelector('[data-act="play"]').disabled);
        assert.equal(await count(), before + (fail ? 0 : 1));
        assert.equal(await play.getAttribute('aria-label'), '播放', 'completion never starts playback');
        const previousTime = await page.evaluate(() => window.__director.getEngine().time);
        await play.click();
        await page.waitForFunction(t => document.querySelector('[data-act="play"]').getAttribute('aria-label') === '暂停' && window.__director.getEngine().time > t, previousTime);
        assert.equal(await page.evaluate(() => document.activeElement?.dataset.act), 'play');
        await play.click();
    }
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.locator('#search').fill('');
    await page.screenshot({ path: `${output}/library-small.png` });
    const fits = await page.locator('.side-tabs').evaluate(el => [...el.children].every(c => c.getBoundingClientRect().right <= el.getBoundingClientRect().right + 1));
    assert.ok(fits, 'sidebar tabs fit at narrow width');
    assert.deepEqual(errors, []);
    console.log('PASS: drag placement, overlap preview, delete/undo, locks, invalid tracks, zoom/scroll, user motions, edge scrolling, explicit single-click playback after success/failure, narrow layout');
} finally { await browser.close(); }
