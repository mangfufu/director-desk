import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
await fs.mkdir('tmp/creation-mode', { recursive: true });
try {
    await page.goto(process.env.DIRECTOR_URL || 'http://127.0.0.1:5183');
    await page.waitForFunction(() => !!window.__director);
    const original = await page.evaluate(() => window.__director.getProject());
    await page.locator('[data-creation-mode="geometry"]').click();
    assert.equal(await page.evaluate(() => window.__director.getProject().creationMode), 'geometry');
    assert.deepEqual(await page.evaluate(() => window.__director.getProject().entities), original.entities);
    await page.locator('[data-act="undo"]').click();
    assert.equal(await page.locator('[data-creation-mode="full"]').getAttribute('aria-pressed'), 'true');
    await page.locator('[data-act="redo"]').click();
    assert.equal(await page.locator('[data-creation-mode="geometry"]').getAttribute('aria-pressed'), 'true');
    const report = await page.evaluate(async () => {
        const call = async (name, args = {}) => { const r = await window.__director.callTool(name, args); if (!r.ok) throw Error(r.error); return r.data; };
        const before = await call('director_read');
        const empty = await call('director_assets');
        const missing = await call('director_assets', { query: 'dog' });
        const all = await call('director_assets', { group: '全部', limit: 50 });
        const built = await call('director_apply', { revision: before.revision, requestId: 'geometry-browser-build', operations: [
            { operation: 'add', asset: 'shape-capsule', id: 'geometry-role', name: '角色甲', position: [0,0,0], patch: {
                color: '#44AA66', assetParameters: { width: .6, height: 1.8, depth: .6 },
                path: { smooth: false, points: [{ time: 0, position: [0,0,0] }, { time: 5, position: [5,0,0] }] },
            } },
            { operation: 'add', asset: 'camera', id: 'geometry-camera', position: [2.5,1.5,6], patch: { camera: { focal: 35, targetId: '', target: [2.5,1,0] } } },
            { operation: 'cuts', value: [{ time: 0, cameraId: 'geometry-camera' }] },
        ] });
        window.__director.setTime(2.5);
        const root = window.__director.getEngine().models.get('geometry-role');
        return { empty, missing, all, guide: before.geometry, built, world: root.position.toArray() };
    });
    assert.deepEqual(report.empty.assets, []); assert.equal(report.missing.found, false);
    assert.equal(report.all.assets.length, 16); assert.equal(report.guide.assets.length, 16);
    assert.equal(report.built.committed, true); assert.deepEqual(report.world, [2.5,0,0]);
    // Isolate a synthetic subject to inspect the actual encoded output.
    await page.evaluate(() => {
        const p = window.__director.getProject();
        p.room.enabled = false; p.references = []; p.production = undefined;
        p.entities = p.entities.filter(e => ['geometry-role','geometry-camera'].includes(e.id));
        p.entities[0].path = null; p.entities[0].position = [2.5,0,0];
        p.aspect = '16:9'; p.duration = 1; p.referenceLabels = false;
        window.__director.replaceProject(p); window.__director.setTime(0);
    });
    const capture = async () => page.evaluate(async () => {
        const api = window.__director, engine = api.getEngine();
        const still = engine.renderOutput(0, 640, 360).toDataURL(); engine.restorePreview(0);
        const bytes = await api.exportForTest({ start: 0, end: .25, fps: 24, width: 640, height: 360, cameraId: 'program', format: 'mp4', monochrome: false });
        const video = document.createElement('video'); video.muted = true;
        const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'video/mp4' }));
        try {
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(Error('video decode timeout')), 15000);
                video.onloadeddata = () => { clearTimeout(timeout); resolve(); };
                video.onerror = () => { clearTimeout(timeout); reject(Error('video decode failed')); };
                video.src = url; video.load();
            });
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(Error('video seek timeout')), 15000);
                video.onseeked = () => { clearTimeout(timeout); resolve(); };
                video.currentTime = .001;
            });
            const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360;
            const ctx = canvas.getContext('2d'); ctx.drawImage(video, 0, 0);
            return { still, decoded: canvas.toDataURL(), pixels: Array.from(ctx.getImageData(0,0,640,360).data), bytes };
        } finally { video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url); }
    });
    const clean = await capture();
    await page.locator('#reference-labels').check();
    assert.equal(await page.evaluate(() => window.__director.getProject().referenceLabels), true);
    const labeled = await capture();
    assert.notEqual(labeled.still, clean.still, 'actual output includes labels');
    const changed = labeled.pixels.reduce((sum, n, i) => sum + (Math.abs(n - clean.pixels[i]) > 30 ? 1 : 0), 0);
    for (const [name, data] of [['clean', clean], ['labeled', labeled]]) {
        await fs.writeFile(`tmp/creation-mode/${name}.png`, Buffer.from(data.still.split(',')[1], 'base64'));
        await fs.writeFile(`tmp/creation-mode/${name}-decoded.png`, Buffer.from(data.decoded.split(',')[1], 'base64'));
        await fs.writeFile(`tmp/creation-mode/${name}.mp4`, Buffer.from(data.bytes));
    }
    assert.ok(changed > 60, `decoded video must contain the label: ${changed}`);
    await page.locator('[data-act="undo"]').click();
    assert.equal(await page.locator('#reference-labels').isChecked(), false);
    assert.equal(await page.evaluate(() => { const e=window.__director.getEngine(); const png=e.renderOutput(0,640,360).toDataURL(); e.restorePreview(0); return png; }), clean.still);
    await page.locator('[data-act="redo"]').click();
    const visibility = await page.evaluate(() => {
        const api = window.__director, base = api.getProject();
        const frame = (project) => { api.replaceProject(project); const e = api.getEngine(); const result = e.renderOutput(0,640,360).toDataURL(); e.restorePreview(0); return result; };
        const checks = [];
        for (const mode of ['hidden', 'pov', 'behind']) {
            const p = structuredClone(base), camera = p.entities.find(e => e.camera).camera;
            if (mode === 'hidden') camera.hiddenEntityIds = ['geometry-role'];
            if (mode === 'pov') { camera.mode = 'pov'; camera.targetId = 'geometry-role'; }
            if (mode === 'behind') { camera.targetId = ''; camera.target = [2.5,1.5,100]; }
            p.referenceLabels = true; const on = frame(p);
            p.referenceLabels = false; checks.push({ mode, same: on === frame(p) });
        }
        api.replaceProject(base); return checks;
    });
    for (const check of visibility) assert.equal(check.same, true, `${check.mode} must not leak a name label`);
    const file = path.resolve('tmp/creation-mode/geometry.director');
    const downloadEvent = page.waitForEvent('download'); await page.locator('[data-act="save"]').click();
    await (await downloadEvent).saveAs(file);
    await page.locator('[data-creation-mode="full"]').click();
    await page.locator('#reference-labels').uncheck();
    await page.locator('#project-file').setInputFiles(file);
    await page.waitForFunction(() => window.__director.getProject().creationMode === 'geometry' && window.__director.getProject().referenceLabels === true);
    assert.equal(await page.locator('[data-creation-mode="geometry"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#reference-labels').isChecked(), true);
    await page.locator('#resource-home').click(); await page.locator('[data-side="assets"]').click();
    assert.equal((await page.locator('#library-count').textContent()).trim(), '16 项');
    await page.screenshot({ path: 'tmp/creation-mode/wide.png' });
    await page.setViewportSize({ width: 1000, height: 720 });
    for (const selector of ['#creation-mode','#reference-labels']) {
        const rect = await page.locator(selector).evaluate(el => el.getBoundingClientRect().toJSON());
        assert.ok(rect.left >= 0 && rect.right <= 1000 && rect.bottom <= 720);
    }
    assert.equal(await page.locator('.view-editing').evaluate(el => el.scrollWidth > el.clientWidth), false);
    assert.equal(await page.locator('.shot-panel .panel-topline').evaluate(el => el.scrollWidth > el.clientWidth), false);
    await page.screenshot({ path: 'tmp/creation-mode/narrow.png' });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ ok: true, changedVideoChannels: changed, checks: ['mode retains scene', 'undo/redo', 'sixteen shapes', 'targeted search', 'direct commit', 'actual path', 'labels in encoded MP4', 'labels off restores clean frame', 'save/reopen', 'narrow toolbar'] }));
} finally { await browser.close(); }
