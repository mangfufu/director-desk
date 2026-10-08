import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { _electron as electron } from 'playwright-core';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
await fs.mkdir('tmp/groups', { recursive: true });
const profile = await fs.mkdtemp(path.resolve('tmp/groups/desktop-'));
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ executablePath: createRequire(import.meta.url)('electron'), args: [path.resolve('.audit/desktop-app'), `--director-test-profile=${profile}`], env });
const client = new Client({ name: 'groups-test', version: '1' });
try {
    assert.equal(path.resolve(await app.evaluate(({ app }) => app.getPath('userData'))), path.resolve(profile));
    const page = await app.firstWindow(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.waitForFunction(() => window.directorDesktop);
    const started = await page.evaluate(() => window.directorDesktop.mcp(true)); assert.equal(started.ok, true);
    const connection = JSON.parse(await fs.readFile(path.join(profile, 'mcp-connection.json'), 'utf8'));
    const token = await app.evaluate(({ safeStorage }, secret) => safeStorage.decryptString(Buffer.from(secret, 'base64')), connection.secret);
    await client.connect(new StreamableHTTPClientTransport(new URL(started.data.url), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
    async function call(name, args) {
        const raw = await client.callTool({ name, arguments: args });
        const result = JSON.parse(raw.content.find(c => c.type === 'text').text); assert.equal(result.ok, true, result.error); return result.data;
    }
    let read = await call('director_read', { sections: [] });
    await call('director_apply', { revision: read.revision, requestId: 'create', operations: [
        { operation: 'add', id: 'group-a', asset: 'cube', position: [0, 0, 0] }, { operation: 'add', id: 'group-b', asset: 'cube', position: [2, 0, 0] },
        { operation: 'group', id: 'group-test', name: '桌面编组', patch: { action: 'create', entityIds: ['group-a', 'group-b'] } },
    ] });
    await page.locator('#scene-group-select').selectOption('group-test');
    await page.locator('#group-move-0').fill('4'); await page.locator('[data-act="group-transform"]').click();
    read = await call('director_read', { ids: ['group-a', 'group-b'], sections: ['entities', 'scene'] });
    assert.deepEqual(read.entities.map(e => e.position), [[4, 0, 0], [6, 0, 0]]);
    await call('director_apply', { revision: read.revision, requestId: 'copy', operations: [{ operation: 'group', id: 'group-test', patch: { action: 'duplicate', newId: 'group-copy' } }] });
    read = await call('director_read', { sections: ['scene'] }); assert.equal(read.groups.length, 2);
    const array = { revision: read.revision, requestId: 'desktop-array', action: 'array', entityIds: ['group-a', 'group-b'], shape: 'grid', count: 3, columns: 2, step: [0, 0, 4], rowStep: [6, 0, 0] };
    const arranged = await call('director_arrange', array); assert.equal(arranged.summary.added.length, 4);
    assert.deepEqual(await call('director_arrange', array), arranged);
    const saved = await call('director_staging', { action: 'save', revision: arranged.revision, requestId: 'desktop-library-save', entityIds: ['group-a', 'group-b'], name: '桌面布景' });
    const list = await call('director_staging', { action: 'list', query: '桌面布景' }); assert.equal(list.total, 1);
    await page.locator('[data-menu="file"]').click(); await page.locator('[data-act="staging-open"]').click();
    await page.getByText('桌面布景', { exact: true }).waitFor();
    await page.screenshot({ path: 'tmp/groups/desktop-library.png' });
    await page.locator('[data-act="close-modal"]').first().click();
    const inserted = await call('director_staging', { action: 'insert', revision: arranged.revision, requestId: 'desktop-library-insert', id: saved.id, position: [0, 0, 8] });
    assert.equal(inserted.addedIds.length, 2);
    read = await call('director_read', { sections: ['scene'] }); assert.equal(read.groups.length, 5);
    await call('director_history', { action: 'undo', revision: read.revision });
    read = await call('director_read', { sections: ['scene'] }); assert.equal(read.groups.length, 4);
    await page.screenshot({ path: 'tmp/groups/desktop.png' }); assert.deepEqual(errors, []);
    console.log('Isolated desktop: packaged group/library UI and real MCP groups, array retries, library save/list/insert and undo passed.');
} finally {
    await client.close().catch(() => {}); await app.evaluate(({ app }) => app.exit(0)).catch(() => {}); await app.close().catch(() => {});
}
