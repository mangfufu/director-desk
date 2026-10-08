const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { createAIHost } = require('../desktop/ai-host.cjs');
const { TOOL_DEFINITIONS, DISCUSSION_TOOLS, isDiscussionToolCall } = require('../src/automation/contract.ts');

for (const lost of [false, true]) test(`assistant coalesces edits and persists each original outcome (lost=${lost})`, async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'director-batch-'));
    let rounds = 0, writes = 0; const requests = [];
    const server = http.createServer(async (req, res) => {
        if (req.method === 'GET') { res.end(JSON.stringify({ data: [] })); return; }
        let raw = ''; for await (const chunk of req) raw += chunk;
        requests.push(JSON.parse(raw)); rounds++;
        const calls = ['a', 'b'].map(id => ({ id, type: 'function', function: { name: 'director_apply', arguments: JSON.stringify({ revision: 1, requestId: id,
            operations: [{ operation: 'add', asset: 'shape-box', id }] }) } }));
        res.end(JSON.stringify({ choices: [{ finish_reason: rounds === 1 ? 'tool_calls' : 'stop', message: { role: 'assistant', content: 'test', ...(rounds === 1 ? { tool_calls: calls } : {}) } }] }));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const dependencies = { directory, safeStorage: { isEncryptionAvailable: () => false }, definitions: TOOL_DEFINITIONS,
        discussionTools: DISCUSSION_TOOLS, isDiscussionToolCall, send() {}, callTool: async (name, args) => {
            if (name === 'director_read') return { ok: true, data: { revision: 1 } };
            writes++; assert.equal(args.requests.length, 2); assert.equal(args.revision, 1);
            if (lost) throw Error('lost renderer result');
            return { ok: true, data: { revision: 2, committed: true, batchRequestIds: ['a', 'b'] } };
        } };
    try {
        let host = createAIHost(dependencies);
        const [profile] = await host.configure({ baseUrl: `http://127.0.0.1:${server.address().port}/v1`, protocol: 'chat', model: 'mock', stream: false, maxTokens: 1000, maxRounds: 3 });
        await host.run({ profileId: profile.id, prompt: 'add two boxes' });
        assert.equal(writes, 1);
        const previous = await host.conversation();
        host = createAIHost(dependencies);
        assert.deepEqual(await host.conversation(), previous);
        await host.run({ profileId: profile.id, prompt: 'continue' });
        const results = requests.at(-1).messages.filter(m => m.role === 'tool').map(m => ({ id: m.tool_call_id, ...JSON.parse(m.content) }));
        assert.deepEqual(results.map(r => r.id), ['a', 'b']);
        for (const result of results) {
            if (lost) assert.equal(result.execution, 'unknown');
            else { assert.equal(result.data.committed, true); assert.deepEqual(result.data.batchRequestIds, ['a', 'b']); }
        }
        assert.equal(writes, 1);
    } finally {
        server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
        assert.equal(path.dirname(directory), path.resolve(os.tmpdir())); assert.match(path.basename(directory), /^director-batch-/);
        await fs.rm(directory, { recursive: true, force: true });
    }
});
