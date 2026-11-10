import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
import os from 'node:os';

// Same workload before/after. Timings are reported, not a universal FPS promise.
// --baseline skips only new optimization assertions, never behavioral checks.
const baseline = process.argv.includes('--baseline');
const output = 'output/playwright/timeline-performance';
await fs.mkdir(output, { recursive: true });
const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
    await page.waitForFunction(() => window.__director);
    const setup = await page.evaluate(async () => {
        const { createScene } = await import('/src/scenes.ts');
        const { entity } = await import('/src/model.ts');
        const project = createScene('blank'); project.duration = 300;
        for (let i = 0; i < 24; i++) {
            const actor = entity('actor', 'human-adult', `性能样本 ${i}`);
            actor.id = `perf-${i}`; actor.position = [(i % 8) * 2, 0, Math.floor(i / 8) * 3];
            actor.clips = Array.from({ length: 48 }, (_, n) => ({ id: `p${i}-${n}`, start: n * 6, end: n * 6 + 2, action: 'idle', speed: 1 }));
            project.entities.push(actor);
        }
        const cameraId = project.cuts[0].cameraId;
        project.cuts = Array.from({ length: 100 }, (_, i) => ({ time: i * 3, cameraId }));
        const start = performance.now(); window.__director.replaceProject(project);
        const engine = window.__director.getEngine(), sample = engine.sample.bind(engine);
        window.__perf = { samples: 0, sampleMs: [], inputs: [], frames: [], rootReplacements: 0, active: false };
        engine.sample = (...args) => {
            const start = performance.now(), value = sample(...args);
            if (window.__perf.active) { window.__perf.samples++; window.__perf.sampleMs.push(performance.now() - start); }
            return value;
        };
        const root = document.querySelector('#timeline-content');
        const observer = new MutationObserver(records => { if (window.__perf.active) window.__perf.rootReplacements += records.filter(r => r.target === root).length; });
        observer.observe(root, { childList: true });
        let eventStart = 0, last = 0;
        document.addEventListener('pointermove', () => { eventStart = performance.now(); }, true);
        window.addEventListener('pointermove', event => { if (window.__perf.active && (event.buttons & 1)) window.__perf.inputs.push(performance.now() - eventStart); });
        const frame = now => { if (window.__perf.active && last) window.__perf.frames.push(now - last); last = now; requestAnimationFrame(frame); }; requestAnimationFrame(frame);
        return { setupMs: performance.now() - start, actors: 24, actionClips: 1152, cuts: 100 };
    });
    const reset = () => page.evaluate(() => Object.assign(window.__perf, { samples: 0, sampleMs: [], inputs: [], frames: [], rootReplacements: 0, active: true }));
    const report = () => page.evaluate(() => {
        const p = window.__perf; p.active = false;
        const stats = values => { const a = [...values].sort((a, b) => a - b); return { count: a.length, median: a[Math.floor(a.length * .5)] ?? 0, p95: a[Math.min(a.length - 1, Math.floor(a.length * .95))] ?? 0 }; };
        return { samples: p.samples, sampleMs: stats(p.sampleMs), inputMs: stats(p.inputs), frameMs: stats(p.frames), rootReplacements: p.rootReplacements };
    });
    const releaseState = async () => {
        assert.equal(await page.evaluate(() => document.documentElement.dataset.timelineDrag), undefined);
        assert.equal(await page.locator('.timeline-drag-floating,.motion-drop-ghost').count(), 0);
    };
    // Measure the first seek, before clip editing warms layout and render caches.
    const firstRuler = await page.locator('.ruler').boundingBox();
    const inspectorBefore = await page.locator('#inspector-content').elementHandle();
    const firstField = await page.locator('#inspector-content input').first().elementHandle();
    await page.mouse.move(firstRuler.x+30,firstRuler.y+10);await reset();await page.mouse.down();
    for(let i=1;i<=24;i++)await page.mouse.move(firstRuler.x+30+i*6,firstRuler.y+10);
    await page.waitForTimeout(180);
    const coldSeek=await report();
    assert.ok(await page.evaluate(()=>window.__director.getEngine().time)>1,'first seek previews before release');
    assert.equal(await firstField.evaluate(el=>el.isConnected),true,'holding the playhead does not replace inspector fields');
    assert.equal(coldSeek.rootReplacements,0);
    const playhead = await page.locator('.timeline-playhead-overlay .playhead-line').boundingBox();
    assert.ok(Math.abs(playhead.x-(firstRuler.x+174))<2,'first seek stays under the pointer');
    await page.mouse.up();await releaseState();
    await page.waitForFunction(el=>!el.isConnected,firstField);
    assert.equal(await inspectorBefore.evaluate(el=>el.isConnected),true,'inspector container is preserved');
    await page.evaluate(()=>window.__director.setTime(0));await page.waitForTimeout(120);
    const bar = page.locator('[data-clip-id="p0-0"]'); await bar.scrollIntoViewIfNeeded();
    let box = await bar.boundingBox();
    await page.mouse.move(box.x + 30, box.y + 12); await page.mouse.down(); await reset();
    for (let i = 1; i <= 24; i++) await page.mouse.move(box.x + 30 + i * 4, box.y + 12);
    await page.waitForTimeout(100);
    const insertion = await report();
    assert.equal(insertion.rootReplacements, 0); assert.equal(insertion.samples, 0);
    assert.equal(await page.evaluate(() => window.__director.getProject().entities.find(e => e.id === 'perf-0').clips[0].start), 0);
    await page.screenshot({ path: `${output}/insertion.png` });
    await page.mouse.up(); await releaseState();
    assert.ok(await page.evaluate(() => window.__director.getProject().entities.find(e => e.id === 'perf-0').clips[0].start) > 0);
    await page.keyboard.press('Control+z');
    assert.equal(await page.evaluate(() => window.__director.getProject().entities.find(e => e.id === 'perf-0').clips[0].start), 0);
    await page.evaluate(async () => {
        const { setSelectedClips } = await import('/src/editor/timeline-selection.ts');
        setSelectedClips(Array.from({ length: 24 }, (_, index) => ({ kind: 'cut', index })));
    });
    const handle = page.locator('[data-cut="0"] [data-resize]'); await handle.scrollIntoViewIfNeeded();
    box = await handle.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + 10); await page.mouse.down(); await reset();
    for (let i = 1; i <= 24; i++) await page.mouse.move(box.x + box.width / 2 + i * 2.5, box.y + 10);
    const resize = await report();
    assert.equal(resize.rootReplacements, 0);
    await page.waitForTimeout(150); await reset(); await page.waitForTimeout(250);
    const heldResize = await report();
    if (!baseline) assert.equal(heldResize.samples, 0, 'stationary resize must not repeatedly evaluate the scene');
    await page.mouse.up(); await releaseState();
    const times = await page.evaluate(() => window.__director.getProject().cuts.map(c => c.time));
    assert.equal(times[1], 4); assert.equal(times[24], 96);
    await page.keyboard.press('Control+z');
    assert.equal(await page.evaluate(() => window.__director.getProject().duration), 300);
    const ruler = await page.locator('.ruler').boundingBox();
    await page.mouse.move(ruler.x + 30, ruler.y + 10); await page.mouse.down(); await reset();
    for (let i = 1; i <= 24; i++) await page.mouse.move(ruler.x + 30 + i * 6, ruler.y + 10);
    await page.waitForTimeout(100);
    const seek = await report();
    assert.ok(await page.evaluate(() => window.__director.getEngine().time) > 1, '3D updates before release');
    await page.mouse.up(); await releaseState();
    // A fixed-time path resize must visibly update before release and restore on cancel.
    await page.evaluate(async () => {
        const { createScene } = await import('/src/scenes.ts');
        const { entity } = await import('/src/model.ts');
        const project=createScene('blank'), actor=entity('actor','human-adult','路径验证');
        actor.id='resize-path'; actor.clips=[];
        actor.path={smooth:false,points:[{time:0,position:[0,0,0]},{time:2,position:[6,0,0]}]};
        project.entities.push(actor); window.__director.replaceProject(project); window.__director.setTime(1.5);
        document.querySelector('#timeline-content').scrollLeft=0;
    });
    const pathHandle=page.locator('[data-path-id="resize-path"] [data-resize="true"]');
    await pathHandle.scrollIntoViewIfNeeded();const pathBox=await pathHandle.boundingBox();
    await page.mouse.move(pathBox.x+pathBox.width/2,pathBox.y+10);await page.mouse.down();
    await page.mouse.move(pathBox.x+pathBox.width/2+60,pathBox.y+10);
    await page.waitForFunction(()=>Math.abs(window.__director.getEngine().models.get('resize-path').position.x-3)<1e-6);
    await page.keyboard.press('Escape');await page.mouse.up();await releaseState();
    assert.equal(await page.evaluate(()=>window.__director.getProject().entities.find(e=>e.id==='resize-path').path.points[1].time),2);
    assert.equal(await page.evaluate(()=>window.__director.getEngine().models.get('resize-path').position.x),4.5);
    const leftHandle=page.locator('[data-path-id="resize-path"] [data-resize="start"]');
    const leftBox=await leftHandle.boundingBox();
    await page.mouse.move(leftBox.x+leftBox.width/2,leftBox.y+10);await page.mouse.down();
    await page.mouse.move(leftBox.x+leftBox.width/2+60,leftBox.y+10);
    await page.waitForFunction(()=>Math.abs(window.__director.getEngine().models.get('resize-path').position.x-3)<1e-6);
    await page.mouse.up();await releaseState();
    assert.deepEqual(await page.evaluate(()=>window.__director.getProject().entities.find(e=>e.id==='resize-path').path.points.map(p=>p.time)),[1,2]);
    await page.keyboard.press('Control+z');
    assert.equal(await page.evaluate(()=>window.__director.getEngine().models.get('resize-path').position.x),4.5);
    assert.deepEqual(errors, []);
    const result = { mode: baseline ? 'baseline' : 'current', platform: `${os.platform()} ${os.release()}`, cpu: os.cpus()[0]?.model, browser: browser.version(), viewport: '1600x1000', setup, coldSeek, insertion, resize, heldResize, seek };
    await fs.writeFile(`${output}/${result.mode}.json`, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); await server.close(); }
