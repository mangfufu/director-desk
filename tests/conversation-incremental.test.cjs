const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { createConversation } = require('../desktop/ai-conversation.cjs');
const { callBatches } = require('../desktop/ai-call-batches.cjs');
const encryption = { isEncryptionAvailable: () => false };
const profile = { id: 'test', model: 'mock', protocol: 'chat', baseUrl: 'http://localhost' };

test('legacy history migrates intact; later writes leave prior entries untouched', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'director-incremental-'));
    try {
        const file = path.join(directory, 'ai-conversation.json');
        const old = { version: 1, sessionId: randomUUID(), profileId: 'test', entries: [{ type: 'user', text: 'old'.repeat(100000) }] };
        await fs.writeFile(file, JSON.stringify(old));
        const store = createConversation({ directory, safeStorage: encryption }); await store.ready;
        await store.start(profile, 'new');
        const root = path.join(directory, 'ai-conversation-' + store.id);
        const first = path.join(root, '0.json'), stat = await fs.stat(first), text = await fs.readFile(first, 'utf8');
        const entry = await store.start(profile, 'another'); entry.context = 'snapshot'; await store.save(entry);
        assert.equal((await fs.stat(first)).mtimeMs, stat.mtimeMs);
        assert.equal(await fs.readFile(first, 'utf8'), text);
        const reopened = createConversation({ directory, safeStorage: encryption }); await reopened.ready;
        assert.deepEqual(reopened.messages(profile), store.messages(profile));
        assert.equal(JSON.parse(await fs.readFile(file, 'utf8')).version, 2);
        await reopened.reset();
        assert.equal(reopened.snapshot().transcript, '');
        await assert.rejects(fs.stat(root), { code: 'ENOENT' });
    } finally {
        assert.equal(path.dirname(directory), path.resolve(os.tmpdir())); assert.match(path.basename(directory), /^director-incremental-/);
        await fs.rm(directory, { recursive: true, force: true });
    }
});

test('coalescing respects revisions, read boundaries, locks and preview semantics', () => {
    const call = (id, revision = 1) => ({ id, name: 'director_apply', args: { revision, requestId: id, operations: [{ operation: 'add', asset: 'shape-box', id }] } });
    const a = call('a'), b = call('b');
    const merged = callBatches([a, b]);
    assert.equal(merged.length, 1); assert.deepEqual(merged[0].args.requests, [a.args, b.args]);
    assert.deepEqual(callBatches([a, b]), merged, 'retry uses the same combined ID');
    assert.equal(callBatches([a, call('b', 2)]).length, 2);
    assert.equal(callBatches([a, { ...b, args: { ...b.args, preview: true } }]).length, 2);
    assert.equal(callBatches([a, { ...b, args: { ...b.args, operations: [{ operation: 'lock', id: 'x', value: false }] } }]).length, 2);
    assert.equal(callBatches([a, { id: 'read', name: 'director_read', args: {} }, b]).length, 3);
    assert.equal(callBatches([a, { ...b, args: a.args }]).length, 2);
});
