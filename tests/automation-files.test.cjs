const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createAutomationFiles } = require('../desktop/automation-files.cjs');

async function fixture(t) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'director-files-'));
    const host = createAutomationFiles({ ready: Promise.resolve(), locations: () => ({ projects: directory, exports: directory }) });
    t.after(async () => { await host.close(); await fs.rm(directory, { recursive: true, force: true }); });
    return { host, directory, call: (action, data) => host.call('automation-' + action, data) };
}
test('automated file output commits only after close, supports random access, and does not overwrite by default', async t => {
    const { call, directory } = await fixture(t);
    const first = await call('write-begin', { kind: 'video', name: 'scene.mp4' });
    await assert.rejects(fs.stat(first.path), { code: 'ENOENT' });
    await call('write-chunk', { id: first.id, bytes: Buffer.from('abcdef') });
    await call('write-chunk', { id: first.id, bytes: Buffer.from('XY'), position: 1 });
    assert.equal((await call('write-close', { id: first.id })).saved, true);
    assert.equal(await fs.readFile(first.path, 'utf8'), 'aXYdef');
    const second = await call('write-begin', { kind: 'video', name: 'scene.mp4' });
    assert.equal(second.filename, 'scene (2).mp4');
    await call('write-abort', { id: second.id });
    assert.deepEqual(await fs.readdir(directory), ['scene.mp4']);
    const replacement = await call('write-begin', { kind: 'video', path: first.path, overwrite: true });
    await call('write-chunk', { id: replacement.id, bytes: Buffer.from('replaced') });
    await call('write-close', { id: replacement.id });
    assert.equal(await fs.readFile(first.path, 'utf8'), 'replaced');
});
test('concurrent destination collision preserves the existing file; failed and aborted writes clean up', async t => {
    const { call, directory, host } = await fixture(t);
    const a = await call('write-begin', { kind: 'project', name: 'test.director' });
    await fs.writeFile(a.path, 'someone else');
    await assert.rejects(call('write-close', { id: a.id }), { code: 'EEXIST' });
    assert.equal(await fs.readFile(a.path, 'utf8'), 'someone else');
    const b = await call('write-begin', { kind: 'video', name: 'cancel.mp4' });
    await assert.rejects(call('write-chunk', { id: b.id, bytes: Buffer.from('x'), position: -1 }));
    await host.close();
    assert.deepEqual(await fs.readdir(directory), ['test.director']);
    await assert.rejects(call('write-begin', { kind: 'project', name: 'wrong.mp4' }));
    await assert.rejects(call('write-begin', { kind: 'project', path: 'relative.director' }));
    await assert.rejects(call('write-begin', { kind: 'project', name: '../escape.director' }));
});
test('model imports pack referenced material files without importing unrelated directory contents', async t => {
    const { call, directory } = await fixture(t);
    await fs.writeFile(path.join(directory, 'mesh.obj'), 'mtllib material.mtl\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n');
    await fs.writeFile(path.join(directory, 'material.mtl'), 'newmtl color\nKd 1 0 0\n');
    await fs.writeFile(path.join(directory, 'private.txt'), 'never include this');
    const result = await call('read', { kind: 'model', path: path.join(directory, 'mesh.obj') });
    assert.equal(result.name, 'mesh.obj');
    assert.equal(result.package.files.length, 2);
    assert.ok(!JSON.stringify(result).includes('private.txt'));
    await fs.writeFile(path.join(directory, 'escape.obj'), 'mtllib ../private.mtl\nv 0 0 0\n');
    await assert.rejects(call('read', { kind: 'model', path: path.join(directory, 'escape.obj') }));
});
