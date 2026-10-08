import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
await fs.mkdir('tmp/human-actions', { recursive: true });
const server = await createServer({ server: { host: '127.0.0.1', port: 0, watch: null } }); await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } }), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`); await page.waitForFunction(() => window.__director);
    const result = await page.evaluate(async () => {
        const { createScene } = await import('/src/scenes.ts'), { entity, clip, ACTIONS } = await import('/src/model.ts');
        const { HUMAN_ASSETS } = await import('/src/assets/catalog/humans.ts');
        const api = window.__director, p = createScene('blank'); p.duration = 4; p.aspect = '1:1';
        const actor = entity('actor', 'human-adult', '动作测试'); actor.id = 'test-actor'; p.entities.push(actor);
        const camera = p.entities.find(e => e.camera); camera.position = [2.5, 2.1, 5]; camera.camera.target = [0, 1.2, 0]; camera.camera.focal = 55;
        const samples = [];
        for (const action of Object.keys(ACTIONS)) {
            actor.clips = [clip(action, 0, 3)]; api.replaceProject(p);
            for (const time of [.3, 1.2, 2.4]) {
                const canvas = api.getEngine().renderOutput(time, 320, 320, 'program');
                samples.push({ action, time, image: canvas.toDataURL() });
            }
        }
        const timings = [];
        for (const asset of ['person', ...HUMAN_ASSETS.map(a => a.id)]) {
            const e = entity('actor', asset, asset); e.id = 'test-actor'; p.entities[p.entities.length - 1] = e;
            e.clips = Object.keys(ACTIONS).map((action, i) => clip(action, i * 3, i * 3 + 3)); p.duration = e.clips.at(-1).end; api.replaceProject(p);
            const engine = api.getEngine(), state = time => { engine.sample(time); return [engine.rigs.get(e.id).hips, ...Object.values(engine.rigs.get(e.id).joints)].flatMap(n => n.matrixWorld.toArray()); };
            const start = performance.now();
            for (let i = 0; i < e.clips.length; i++) for (const phase of [0, .25, .5, .75, .999]) {
                const time = i * 3 + phase * 3, a = state(time); state(p.duration - .01); state(0); const b = state(time);
                if (!a.every(Number.isFinite) || a.some((v, j) => Math.abs(v - b[j]) > 1e-9)) throw Error(`Non-deterministic action: ${asset}/${e.clips[i].action}`);
            }
            timings.push({ asset, sampleMs: (performance.now() - start) / (e.clips.length * 5 * 4) });
        }
        return { samples, timings };
    });
    for (const item of result.samples) await fs.writeFile(`tmp/human-actions/${item.action}-${item.time}.png`, Buffer.from(item.image.split(',')[1], 'base64'));
    // Renderer-produced images form the review sheet; no image generation/editing is involved.
    const sheet = await browser.newPage();
    await sheet.setContent('<body style="margin:0;background:#171717"><canvas id="sheet"></canvas></body>');
    await sheet.evaluate(async samples => {
        const canvas = document.querySelector('canvas'), ctx = canvas.getContext('2d'); canvas.width = 6 * 320; canvas.height = Math.ceil(samples.length / 6) * 348;
        ctx.fillStyle = '#171717'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < samples.length; i++) { const img = new Image(); img.src = samples[i].image; await img.decode(); const x = i % 6 * 320, y = Math.floor(i / 6) * 348; ctx.drawImage(img, x, y); ctx.fillStyle = '#fff'; ctx.font = '16px sans-serif'; ctx.fillText(`${samples[i].action} · ${samples[i].time}s`, x + 10, y + 340); }
    }, result.samples);
    await sheet.locator('canvas').screenshot({ path: 'tmp/human-actions/review.png' });
    assert.deepEqual(errors, []); console.log(JSON.stringify(result.timings));
} finally { await browser.close(); await server.close(); }
