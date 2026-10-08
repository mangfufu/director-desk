import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
await fs.mkdir('tmp/groups', { recursive: true });
const server = await createServer({ server: { host: '127.0.0.1', port: 0, watch: { ignored: ['**/tmp/**', '**/.audit/**'] } } });
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => d.accept());
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`); await page.waitForFunction(() => window.__director);
    await page.evaluate(async () => {
        const { createScene } = await import('/src/scenes.ts'), { entity } = await import('/src/model.ts');
        const p = createScene('blank');
        for (let i = 0; i < 3; i++) {
            const e = entity('prop', 'cube', `布局 ${i}`, [i * i + 1, 0, i]); e.id = `layout-${i}`;
            e.rotation[1] = i * .4; e.scale = [1 + i, 1, 1]; p.entities.push(e);
        }
        window.__director.replaceProject(p);
    });
    const project = () => page.evaluate(() => window.__director.getProject());
    const call = async (name, args = {}) => {
        const r = await page.evaluate(([n, a]) => window.__director.callTool(n, a), [name, args]); assert.equal(r.ok, true, r.error); return r.data;
    };
    const revision = async () => (await call('director_read', { sections: [] })).revision;
    const open = async (menu, action) => { await page.locator(`[data-menu="${menu}"]`).click(); await page.locator(`[data-act="${action}"]`).click(); };
    const select = async () => {
        await page.locator('.object-row[data-select="layout-0"]').click();
        for (const id of ['layout-1', 'layout-2']) await page.locator(`.object-row[data-select="${id}"]`).click({ modifiers: ['Control'] });
    };
    await select(); await open('edit', 'arrange-open');
    await page.locator('#arrange-alignment').selectOption('min'); await page.locator('[data-act="arrange-apply"]').click();
    const edges = await page.evaluate(async () => {
        const { arrangementBounds } = await import('/src/editor/arrangement-bounds.ts');
        return Object.values(arrangementBounds(window.__director.getEngine(), ['layout-0', 'layout-1', 'layout-2'])).map(b => b.min[0]);
    });
    assert.ok(edges.every(v => Math.abs(v - edges[0]) < 1e-6));
    await open('edit', 'undo');
    assert.deepEqual((await project()).entities.filter(e => e.id.startsWith('layout-')).map(e => e.position[0]), [1, 2, 5]);
    await select(); await open('edit', 'arrange-open'); await page.locator('#arrange-action').selectOption('grid');
    await page.screenshot({ path: 'tmp/groups/arrangement.png' });
    await page.locator('[data-act="arrange-apply"]').click();
    assert.equal((await project()).entities.filter(e => e.name.startsWith('布局')).length, 15);
    await open('edit', 'undo'); assert.equal((await project()).entities.filter(e => e.name.startsWith('布局')).length, 3);
    const args = { revision: await revision(), requestId: 'arrange-once', action: 'array', entityIds: ['layout-0'], shape: 'circle', count: 4, radius: 4, rotate: true };
    const first = await call('director_arrange', args), beforeRetry = await project();
    assert.deepEqual(await call('director_arrange', args), first); assert.deepEqual(await project(), beforeRetry);
    const stale = await page.evaluate(a => window.__director.callTool('director_arrange', { ...a, requestId: 'stale' }), args); assert.equal(stale.ok, false);
    await open('edit', 'undo'); await select();
    await open('file', 'staging-open'); await page.locator('#staging-name').fill('测试布景'); await page.locator('[data-act="staging-save"]').click();
    await page.locator('.staging-item').waitFor();
    await page.locator('#staging-name').fill('三件组合'); await page.locator('[data-act="staging-rename"]').click();
    await page.getByText('三件组合', { exact: true }).waitFor();
    for (const width of [1024, 1440]) {
        await page.setViewportSize({ width, height: 768 });
        const box = await page.locator('.staging-library').boundingBox(); assert.ok(box && box.x >= 0 && box.x + box.width <= width && box.y + box.height <= 768);
        assert.equal(await page.locator('.staging-library').evaluate(el => el.scrollWidth > el.clientWidth + 1), false);
    }
    await page.screenshot({ path: 'tmp/groups/staging-library.png' });
    const downloadPromise = page.waitForEvent('download'); await page.locator('[data-act="staging-export"]').click();
    const download = await downloadPromise; await download.saveAs('tmp/groups/export.staging');
    const file = JSON.parse(await fs.readFile('tmp/groups/export.staging', 'utf8')); assert.equal(file.name, '三件组合'); assert.equal(file.entityIds.length, 3);
    await page.locator('#staging-pos-0').fill('10'); await page.locator('#staging-pos-1').fill('0'); await page.locator('#staging-pos-2').fill('0');
    const beforeInsert = await project(); await page.locator('[data-act="staging-insert"]').click();
    await page.waitForFunction(count => window.__director.getProject().entities.length === count + 3, beforeInsert.entities.length);
    assert.deepEqual((await project()).cuts, beforeInsert.cuts);
    await open('edit', 'undo'); assert.deepEqual(await project(), beforeInsert);
    await open('file', 'staging-open'); await page.locator('#staging-file').setInputFiles('tmp/groups/export.staging');
    await page.waitForFunction(() => document.querySelectorAll('.staging-item').length === 2);
    await page.locator('[data-act="close-modal"]').first().click();
    await page.reload(); await page.waitForFunction(() => window.__director);
    assert.equal((await call('director_staging', { action: 'list', query: '三件组合' })).total, 2);
    const saved = await call('director_staging', { action: 'save', revision: await revision(), requestId: 'save', entityIds: ['layout-0', 'layout-1'], name: 'AI 布景' });
    const detail = await call('director_staging', { action: 'read', id: saved.id }); assert.equal(detail.entities.length, 2); assert.equal(detail.scene, undefined);
    const insertArgs = { action: 'insert', id: saved.id, position: [5, 0, 5], revision: await revision(), requestId: 'insert' };
    const inserted = await call('director_staging', insertArgs); assert.equal(inserted.addedIds.length, 2);
    assert.deepEqual(await call('director_staging', insertArgs), inserted);
    // A source-load failure must not change project data, revision or undo history.
    const loadFailure = await page.evaluate(async id => {
        const api = window.__director, engine = api.getEngine(), before = JSON.stringify(api.getProject());
        const revision = (await api.callTool('director_read', { sections: [] })).data.revision;
        const prepare = engine.externalModels.prepare;
        engine.externalModels.prepare = async () => { throw Error('测试资源加载失败'); };
        try {
            const result = await api.callTool('director_staging', { action: 'insert', id, revision, requestId: 'failed-load' });
            return { result, unchanged: before === JSON.stringify(api.getProject()), revision: (await api.callTool('director_read', { sections: [] })).data.revision, beforeRevision: revision };
        } finally { engine.externalModels.prepare = prepare; }
    }, saved.id);
    assert.equal(loadFailure.result.ok, false); assert.equal(loadFailure.unchanged, true); assert.equal(loadFailure.revision, loadFailure.beforeRevision);
    await call('director_staging', { action: 'rename', id: saved.id, name: '改名', revision: await revision(), requestId: 'rename' });
    await call('director_staging', { action: 'remove', id: saved.id, revision: await revision(), requestId: 'remove' });
    assert.equal((await call('director_staging', { action: 'list', query: '改名' })).total, 0);
    for (let i = 0; i < 5; i++) await call('director_staging', { action: 'save', revision: await revision(), requestId: `page-${i}`, entityIds: ['layout-0'], name: '较长的布景名称'.repeat(20) + i });
    await open('file', 'staging-open'); await page.locator('.staging-item').first().waitFor();
    assert.equal(await page.locator('.staging-item').count(), 5);
    await page.setViewportSize({ width: 1024, height: 768 });
    const fitting = await page.locator('.modal').evaluate(el => {
        const r = el.getBoundingClientRect(), body = el.querySelector('.modal-body');
        return { top: r.top, bottom: r.bottom, height: innerHeight, scroll: [body.scrollHeight, body.clientHeight, body.scrollWidth, body.clientWidth] };
    });
    await page.screenshot({ path: 'tmp/groups/library-full.png' });
    assert.ok(fitting.top >= 0 && fitting.bottom <= fitting.height && fitting.scroll[0] <= fitting.scroll[1] + 1 && fitting.scroll[2] <= fitting.scroll[3] + 1, JSON.stringify(fitting));
    await page.locator('[data-act="staging-next"]').click();
    await page.waitForFunction(() => document.querySelectorAll('.staging-item').length === 2);
    assert.deepEqual(errors, []);
    console.log('Arrangement/library UI and tool calls: geometry alignment, array/undo, idempotency, stale revision, save/rename/share/insert, persistence and layout passed.');
} finally { await browser.close(); await server.close(); }
