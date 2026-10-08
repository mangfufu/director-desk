const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createFileHost } = require('../desktop/file-host.cjs');

test('video export uses the default directory, numbers collisions atomically and rejects paths', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'director-export-'));
    const defaults = { projects: path.join(root, 'projects'), exports: path.join(root, 'exports') };
    try {
        const host = createFileHost({ directory: root, defaults }); await host.ready;
        const bytes = Uint8Array.from([1, 2, 3]);
        const results = await Promise.all([host.saveExport({ name: '测试.mp4', bytes }), host.saveExport({ name: '测试.mp4', bytes: bytes.buffer })]);
        assert.deepEqual(results.map(r => r.filename).sort(), ['测试 (2).mp4', '测试.mp4'].sort());
        for (const result of results) assert.deepEqual(await fs.readFile(path.join(defaults.exports, result.filename)), Buffer.from(bytes));
        for (const name of ['../escape.mp4', 'C:\\escape.mp4', 'video.exe', 'CON.mp4', 'a:b.mp4', '.hidden.mp4'])
            await assert.rejects(host.saveExport({ name, bytes }), /文件名/);
        await assert.rejects(host.saveExport({ name: 'empty.mp4', bytes: new Uint8Array() }), /大小/);
        await assert.rejects(host.saveExport({ name: 'bad.mp4', bytes: [1, 2] }), /数据/);
        assert.equal((await fs.readdir(defaults.exports)).length, 2);
    } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('separate default directories persist locally; saving confirms actual atomic completion and cancellation', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'director-files-'));
    const defaults = { projects: path.join(root, 'projects'), exports: path.join(root, 'exports') };
    let destination, picked, seenDefault;
    const options = { directory: path.join(root, 'profile'), defaults, chooseDirectory: async () => picked,
        chooseSave: async defaultPath => { seenDefault = defaultPath; return destination; } };
    try {
        const host = createFileHost(options); await host.ready;
        assert.equal(host.defaultPath('film.mp4'), path.join(defaults.exports, 'film.mp4'));
        assert.equal(host.defaultPath('scene.director'), path.join(defaults.projects, 'scene.director'));
        assert.equal(host.defaultPath('../../scene.director'), path.join(defaults.projects, 'scene.director'));
        const content = JSON.stringify({ format: 'director-desk', version: 3, name: 'test' });
        assert.deepEqual(await host.saveProject({ name: 'scene', content }), { saved: false });
        assert.equal(seenDefault, path.join(defaults.projects, 'scene.director'));
        destination = path.join(defaults.projects, 'scene.director');
        await fs.writeFile(destination, 'old content');
        assert.deepEqual(await host.saveProject({ name: 'scene', content }), { saved: true, path: destination });
        assert.equal(await fs.readFile(destination, 'utf8'), content);
        const boundPath = destination; destination = null;
        const changedContent = JSON.stringify({ format: 'director-desk', version: 3, name: 'edited' });
        assert.deepEqual(await host.saveProject({ name: 'renamed', content: changedContent, path: boundPath }), { saved: true, path: boundPath });
        assert.equal(await fs.readFile(boundPath, 'utf8'), changedContent);
        // Canceled Save As leaves the existing document intact.
        assert.deepEqual(await host.saveProject({ name: 'another', content }), { saved: false });
        destination = boundPath;
        assert.deepEqual(await fs.readdir(defaults.projects), ['scene.director']);
        const old = await fs.readFile(destination, 'utf8'); destination = defaults.projects + '.txt';
        await assert.rejects(host.saveProject({ name: 'scene', content }), /director/);
        assert.equal(await fs.readFile(path.join(defaults.projects, 'scene.director'), 'utf8'), old);
        destination = path.join(root, 'missing-parent', 'scene.director');
        await assert.rejects(host.saveProject({ name: 'scene', content }));
        picked = path.join(root, 'chosen'); await fs.mkdir(picked);
        await host.choose('projects');
        const reopened = createFileHost(options); await reopened.ready;
        assert.equal(reopened.read().projects, picked); assert.equal(reopened.read().exports, defaults.exports);
        await assert.rejects(host.choose('other'), /未知/);
        picked = null; assert.deepEqual(await host.choose('exports'), reopened.read());
    } finally { await fs.rm(root, { recursive: true, force: true }); }
});
