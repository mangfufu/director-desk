import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { _electron as electron } from 'playwright-core';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
await fs.mkdir('tmp/review', { recursive: true });
const profile = await fs.mkdtemp(path.resolve('tmp/review/mcp-files-'));
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ executablePath: createRequire(import.meta.url)('electron'), args: [path.resolve('.audit/desktop-app'), `--director-test-profile=${profile}`], env });
const client = new Client({ name: 'file-control-test', version: '1' });
try {
    assert.equal(path.resolve(await app.evaluate(({ app }) => app.getPath('userData'))), profile);
    await app.evaluate(({ dialog }) => {
        dialog.showOpenDialog = async () => { throw Error('Unexpected open dialog'); };
        dialog.showSaveDialog = async () => { throw Error('Unexpected save dialog'); };
    });
    const page = await app.firstWindow(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.waitForFunction(() => window.directorDesktop);
    const started = await page.evaluate(() => window.directorDesktop.mcp()); assert.equal(started.ok, true);
    assert.equal(started.data.enabled, true, 'MCP starts automatically without opening its panel');
    const connection = JSON.parse(await fs.readFile(path.join(profile, 'mcp-connection.json'), 'utf8'));
    const token = await app.evaluate(({ safeStorage }, secret) => safeStorage.decryptString(Buffer.from(secret, 'base64')), connection.secret);
    await client.connect(new StreamableHTTPClientTransport(new URL(started.data.url), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
    const raw = async (name, args) => JSON.parse((await client.callTool({ name, arguments: args })).content.find(c => c.type === 'text').text);
    async function call(name, args = {}) { const r = await raw(name, args); assert.equal(r.ok, true, `${name}: ${r.error}`); return r.data; }
    let read;
    for (let i = 0; i < 150; i++) {
        const r = await raw('director_read', { sections: [] });
        if (r.ok) { read = r.data; break; }
        assert.match(r.error, /尚未连接或正在重新载入/); await new Promise(r => setTimeout(r, 100));
    }
    assert.ok(read, 'renderer ready');
    async function finish(ref) {
        for (let i = 0; i < 600; i++) {
            const j = await call('director_job', { id: ref.jobId });
            if (j.status !== 'running') { assert.equal(j.status, 'completed', j.error); return j.result; }
            await new Promise(r => setTimeout(r, 100));
        }
        throw Error('job timed out');
    }
    const directory = path.join(profile, 'outputs');
    await call('director_settings', { scope: 'files', action: 'set', patch: { projects: directory, exports: directory }, requestId: 'locations' });
    await call('director_settings', { scope: 'editor', action: 'set', patch: { navigationSpeed: 4 }, requestId: 'editor' });
    assert.equal((await call('director_settings', { scope: 'editor', action: 'read' })).values.navigationSpeed, 4);
    const exported = await finish(await call('director_export', { kind: 'project', filename: 'original.director', requestId: 'original' }));
    assert.equal(exported.files[0].saved, true);
    const original = JSON.parse(await fs.readFile(exported.files[0].path, 'utf8'));
    const openPath = path.join(profile, 'replacement.director'), replacement = structuredClone(original);
    replacement.name = 'MCP file test'; await fs.writeFile(openPath, JSON.stringify(replacement));
    const importArgs = { kind: 'project', path: openPath, revision: read.revision, requestId: 'open' };
    const imported = await call('director_import', importArgs);
    assert.deepEqual(await call('director_import', importArgs), imported);
    await finish(imported);
    read = await call('director_read', { sections: [] }); assert.equal(read.name, replacement.name);
    await call('director_history', { action: 'undo', revision: read.revision });
    read = await call('director_read', { sections: [] }); assert.equal(read.name, original.name);
    const count = read.entityCount;
    const merged = await finish(await call('director_import', { kind: 'project', mode: 'merge', path: openPath, offset: [20,0,0], revision: read.revision, requestId: 'merge' }));
    assert.equal(merged.mode, 'merge');
    read = await call('director_read', { sections: [] }); assert.ok(read.entityCount > count);
    await call('director_history', { action: 'undo', revision: read.revision });
    read = await call('director_read', { sections: [] }); assert.equal(read.entityCount, count);
    const stale = await raw('director_import', { kind: 'project', path: openPath, revision: read.revision - 1, requestId: 'stale-open' });
    assert.equal(stale.ok, false); assert.match(stale.error, /REVISION_CONFLICT/);
    const obj = path.join(profile, 'triangle.obj'); await fs.writeFile(obj, 'v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n');
    const model = await finish(await call('director_import', { kind: 'model', path: obj, revision: read.revision, requestId: 'model', name: 'Imported triangle' }));
    assert.ok(model.entityId); assert.equal(model.meshes, 1);
    read = await call('director_read', { sections: ['entities'], ids: [model.entityId] }); assert.equal(read.entities.length, 1);
    const view = await call('director_view', { time: 0, entityIds: [model.entityId], mode: 'split', focus: 'selected', playing: false });
    assert.deepEqual(view.selection.entityIds, [model.entityId]);
    await call('director_settings', { scope: 'layout', action: 'set', patch: { split: 60 }, requestId: 'layout' });
    assert.equal((await call('director_settings', { scope: 'layout', action: 'read' })).split, 60);
    assert.equal(await page.evaluate(() => document.documentElement.style.getPropertyValue('--stage-share')), '60');
    const grounded = await call('director_place', { action: 'ground', entityId: model.entityId, revision: read.revision, requestId: 'ground' });
    read = await call('director_read', { sections: [] }); assert.equal(read.revision, grounded.revision);
    const staging = await call('director_staging', { action: 'save', entityIds: [model.entityId], name: 'Portable block', revision: read.revision, requestId: 'save-block' });
    const blockFile = await call('director_staging', { action: 'export', id: staging.id, filename: 'block.staging', revision: read.revision, requestId: 'export-block' });
    assert.equal(blockFile.saved, true);
    await call('director_staging', { action: 'remove', id: staging.id, revision: read.revision, requestId: 'remove-block' });
    await finish(await call('director_import', { kind: 'staging', path: blockFile.path, revision: read.revision, requestId: 'import-block' }));
    assert.equal((await call('director_staging', { action: 'list', query: 'Portable block' })).total, 1);
    const motion = await finish(await call('director_import', { kind: 'motion', path: path.resolve('test-assets/external/CesiumMan/CesiumMan.glb'), revision: read.revision, requestId: 'import-motion' }));
    const changedMotion = await call('director_motion_library', { action: 'update', id: motion.motionId, patch: { name: 'Edited motion' }, requestId: 'rename-motion' });
    assert.equal(changedMotion.motion.name, 'Edited motion');
    await call('director_motion_library', { action: 'remove', id: motion.motionId, requestId: 'remove-motion' });
    assert.equal((await call('director_motions', { source: 'user', query: 'Edited motion' })).total, 0);
    const screenshot = await finish(await call('director_export', { kind: 'screenshot', size: 640, filename: 'view.png' }));
    assert.ok((await fs.stat(screenshot.files[0].path)).size > 100);
    const video = await finish(await call('director_export', { kind: 'video', size: 640, start: 0, end: .25, filename: 'preview' }));
    assert.ok((await fs.stat(video.files[0].path)).size > 100);
    assert.equal((await fs.readFile(video.files[0].path)).subarray(4, 8).toString(), 'ftyp');
    const metadata = await page.evaluate(async bytes => {
        const element = document.createElement('video'), url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'video/mp4' }));
        try {
            await new Promise((resolve, reject) => { element.onloadedmetadata = resolve; element.onerror = () => reject(Error('MP4 decode failed')); element.src = url; });
            return { duration: element.duration, width: element.videoWidth, height: element.videoHeight };
        } finally { element.removeAttribute('src'); element.load(); URL.revokeObjectURL(url); }
    }, [...await fs.readFile(video.files[0].path)]);
    assert.ok(metadata.duration >= .2 && metadata.duration <= .4); assert.equal(Math.max(metadata.width, metadata.height), 640);
    await call('director_scene', { action: 'new-project', template: 'blank', name: 'Batch export', revision: read.revision, requestId: 'new-document' });
    read = await call('director_read', { sections: ['scene'] }); const sceneA = read.sceneContext.sceneId;
    await call('director_apply', { revision: read.revision, requestId: 'duration', operations: [{ operation: 'project', patch: { duration: 1 } }, { operation: 'notes', value: { fixedPrompt: '', sceneReferenceIds: [], notes: [], promptText: 'Reference video prompt', textOnlyPrompt: 'Text-only prompt' } }] });
    read = await call('director_read', { sections: [] });
    await call('director_scene', { action: 'copy', name: 'Second export', revision: read.revision, requestId: 'copy-scene' });
    read = await call('director_read', { sections: [] }); const sceneB = read.sceneContext.sceneId;
    const batch = await finish(await call('director_export', { kind: 'depth-video', scenes: [{ sceneId: sceneA, filename: 'depth-a' }, { sceneId: sceneB, filename: 'depth-b' }], size: 640 }));
    assert.equal(batch.files.length, 2); for (const file of batch.files) assert.ok((await fs.stat(file.path)).size > 100);
    assert.equal((await call('director_read', { sections: [] })).sceneContext.sceneId, sceneB, 'batch restored active scene');
    const prompt = await finish(await call('director_export', { kind: 'prompt', promptMode: 'text-only', filename: 'prompt.txt' }));
    assert.match(await fs.readFile(prompt.files[0].path, 'utf8'), /Text-only prompt/);
    const skillDir = path.join(profile, 'test-skill'); await fs.mkdir(skillDir); await fs.writeFile(path.join(skillDir, 'SKILL.md'), '---\nname: automation-test\ndescription: Temporary test\n---\n# Test\nRead only.\n');
    const skills = await call('director_application', { scope: 'skills', action: 'import', data: { path: skillDir }, requestId: 'skill-import' });
    const custom = skills.skills.find(s => s.name === 'automation-test'); assert.ok(custom);
    await call('director_application', { scope: 'skills', action: 'enable', data: { id: custom.id, enabled: false }, requestId: 'skill-disable' });
    await call('director_application', { scope: 'skills', action: 'remove', data: { id: custom.id }, requestId: 'skill-remove' });
    read = await call('director_read', { sections: [] });
    await call('director_apply', { revision: read.revision, requestId: 'cancel-duration', operations: [{ operation: 'project', patch: { duration: 60 } }] });
    const cancel = await call('director_export', { kind: 'video', size: 1920, fps: 60, filename: 'canceled' });
    await call('director_job', { id: cancel.jobId, cancel: true });
    let canceled;
    for (let i = 0; i < 100; i++) { canceled = await call('director_job', { id: cancel.jobId }); if (canceled.status !== 'running') break; await new Promise(r => setTimeout(r, 100)); }
    assert.equal(canceled.status, 'canceled');
    assert.ok(!(await fs.readdir(directory)).some(name => name.endsWith('.tmp') || name.startsWith('canceled')));
    assert.deepEqual(errors, []);
    console.log('Real desktop MCP: no-dialog save/open/undo, idempotent imports, OBJ, motion/staging/skill libraries, placement, view/layout/settings, PNG/MP4/TXT and batch depth export passed.');
    console.log('Artifacts:', path.relative(process.cwd(), directory));
} finally {
    await client.close().catch(() => {}); await app.evaluate(({ app }) => app.exit(0)).catch(() => {}); await app.close().catch(() => {});
}
