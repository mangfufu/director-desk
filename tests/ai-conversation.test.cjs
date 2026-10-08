const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { createAIHost } = require('../desktop/ai-host.cjs');
const { createConversation } = require('../desktop/ai-conversation.cjs');
const { TOOL_DEFINITIONS, DISCUSSION_TOOLS, isDiscussionToolCall } = require('../src/automation/contract.ts');
const policy = { definitions: TOOL_DEFINITIONS, discussionTools: DISCUSSION_TOOLS, isDiscussionToolCall };
const localStorage = { isEncryptionAvailable: () => false };
const call = id => ({ id, name: 'director_apply', args: { revision: id === 'second' ? 2 : id === 'third' ? 3 : 1, requestId: id, operations: [{ operation: 'add', asset: 'person', id }] } });
function reply(protocol, calls = [], text = '继续完成') {
    if (protocol === 'chat') return { choices: [{ finish_reason: calls.length ? 'tool_calls' : 'stop', message: { role: 'assistant', content: text,
        ...(calls.length ? { tool_calls: calls.map(c => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args) } })) } : {}) } }] };
    if (protocol === 'responses') return { status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }, ...calls.map(c => ({ type: 'function_call', call_id: c.id, name: c.name, arguments: JSON.stringify(c.args) }))] };
    return { stop_reason: calls.length ? 'tool_use' : 'end_turn', content: [{ type: 'text', text }, ...calls.map(c => ({ type: 'tool_use', id: c.id, name: c.name, input: c.args }))] };
}
function outcomes(protocol, body) {
    if (protocol === 'chat') return body.messages.filter(m => m.role === 'tool').map(m => ({ id: m.tool_call_id, result: JSON.parse(m.content) }));
    if (protocol === 'responses') return body.input.filter(m => m.type === 'function_call_output').map(m => ({ id: m.call_id, result: JSON.parse(m.output) }));
    return body.messages.flatMap(m => Array.isArray(m.content) ? m.content.filter(c => c.type === 'tool_result').map(c => ({ id: c.tool_use_id, result: JSON.parse(c.content) })) : []);
}
async function cleanup(directory) {
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir())); assert.match(path.basename(directory), /^director-conversation-/);
    await fs.rm(directory, { recursive: true, force: true });
}

for (const protocol of ['chat', 'responses', 'anthropic']) for (const scenario of ['stop', 'conflict', 'unknown', 'round-limit', 'network']) {
    test(`${protocol}: ${scenario} retains history and tool outcomes across restart`, async () => {
        const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'director-conversation-'));
        let host, requests = [], writes = [], recovering = false;
        const server = http.createServer(async (req, res) => {
            let text = ''; for await (const chunk of req) text += chunk; const body = JSON.parse(text); requests.push(body);
            if (!recovering && scenario === 'network' && requests.length === 2) { res.writeHead(503); res.end('unavailable'); return; }
            res.end(JSON.stringify(reply(protocol, recovering ? [] : scenario === 'round-limit' || scenario === 'network' ? [call('first')] : [call('first'), call('second'), call('third')])));
        });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const dependencies = { directory, safeStorage: localStorage, ...policy, send() {}, callTool: async (name, args) => {
            if (name !== 'director_apply') return { ok: true, data: { revision: 1 } };
            writes.push(args.requestId);
            if (args.requestId === 'first' && scenario === 'stop') host.stop();
            if (args.requestId === 'second' && scenario === 'conflict') return { ok: false, error: 'REVISION_CONFLICT: newer project', revision: 2 };
            if (args.requestId === 'second' && scenario === 'unknown') throw Error('Lost renderer result');
            return { ok: true, data: { committed: true, revision: 2 } };
        } };
        try {
            host = createAIHost(dependencies);
            const [profile] = await host.configure({ baseUrl: `http://127.0.0.1:${server.address().port}/v1`, protocol, model: 'mock', stream: false, maxTokens: 1000, maxRounds: scenario === 'round-limit' ? 1 : 4 });
            const first = await host.run({ profileId: profile.id, prompt: '记住：主角始终穿蓝色', mode: 'execute' });
            assert.equal(first.stopped, true);
            const previous = await host.conversation(); assert.match(previous.transcript, /主角始终穿蓝色/); assert.match(previous.transcript, /对话已保留/);
            const completedWrites = [...writes];
            host = createAIHost(dependencies); recovering = true;
            assert.deepEqual(await host.conversation(), previous, 'restart restores transcript and same session');
            const second = await host.run({ profileId: profile.id, sessionId: first.sessionId, prompt: '继续', mode: 'execute' });
            assert.equal(second.sessionId, first.sessionId); assert.equal(second.stopped, undefined, (await host.conversation()).transcript); assert.deepEqual(writes, completedWrites, 'no tool is automatically replayed');
            assert.match(JSON.stringify(requests.at(-1)), /主角始终穿蓝色/);
            const saved = outcomes(protocol, requests.at(-1)); assert.equal(saved[0].result.data.committed, true);
            if (scenario === 'stop') { assert.equal(saved[1].result.execution, 'not-started'); assert.equal(saved[2].result.execution, 'not-started'); }
            if (scenario === 'conflict') { assert.match(saved[1].result.error, /REVISION_CONFLICT/); assert.equal(saved[2].result.execution, 'not-started'); }
            if (scenario === 'unknown') { assert.equal(saved[1].result.execution, 'unknown'); assert.equal(saved[2].result.execution, 'not-started'); }
            const reset = await host.newConversation(); assert.notEqual(reset.sessionId, first.sessionId); assert.equal(reset.transcript, '');
            await host.run({ profileId: profile.id, prompt: '新任务', mode: 'execute' });
            assert.ok(!JSON.stringify(requests.at(-1)).includes('主角始终穿蓝色'));
        } finally { host?.stop(); server.closeAllConnections(); await new Promise(r => server.close(r)); await cleanup(directory); }
    });
}

test('switching providers preserves complete text and tool pairs in the target protocol without deleting native history', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'director-conversation-')); const requests = [];
    const server = http.createServer(async (req, res) => {
        let raw = ''; for await (const part of req) raw += part; const body = JSON.parse(raw); requests.push(body);
        const protocol = body.model;
        res.end(JSON.stringify(reply(protocol, requests.length === 1 ? [call('original-call')] : [], '已记住蓝衣主角')));
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    try {
        const host = createAIHost({ directory, safeStorage: localStorage, ...policy, send() {}, callTool: async () => ({ ok: true, data: { committed: true } }) });
        let sessionId;
        for (const protocol of ['chat', 'anthropic', 'responses', 'chat']) {
            const profiles = await host.configure({ baseUrl: `http://127.0.0.1:${server.address().port}/v1`, protocol, model: protocol, stream: false, maxTokens: 1000, maxRounds: 3 });
            const next = await host.run({ profileId: profiles.at(-1).id, sessionId, prompt: sessionId ? '继续原任务' : '主角穿蓝衣', mode: 'execute' });
            if (sessionId) assert.equal(next.sessionId, sessionId); sessionId = next.sessionId;
            assert.match(JSON.stringify(requests.at(-1)), /主角穿蓝衣/);
            assert.equal(outcomes(protocol, requests.at(-1))[0].id, 'original-call');
        }
        const disk = await require('../desktop/conversation-store.cjs').conversationStore(directory, localStorage).load();
        assert.ok(disk.entries.some(e => e.protocol === 'chat' && e.assistant.tool_calls?.[0].id === 'original-call'));
        assert.equal(disk.entries.filter(e => e.type === 'user').length, 4);
    } finally { server.closeAllConnections(); await new Promise(r => server.close(r)); await cleanup(directory); }
});

test('conversation storage retains long history, uses system encryption, and does not overwrite unreadable history automatically', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'director-conversation-'));
    // Reversible test cipher; the application calls Electron safeStorage, not this fixture.
    const safeStorage = { isEncryptionAvailable: () => true, encryptString: s => Buffer.from(s).map(v => v ^ 42), decryptString: b => Buffer.from(b).map(v => v ^ 42).toString() };
    const profile = { id: 'local', model: 'mock', protocol: 'chat', baseUrl: 'http://127.0.0.1' };
    try {
        const store = createConversation({ directory, safeStorage }); await store.ready;
        await store.start(profile, '开头要保留' + '蓝'.repeat(130000) + '结尾要保留');
        const saved = await fs.readFile(path.join(directory, 'ai-conversation.json'), 'utf8'); assert.ok(!saved.includes('开头要保留'));
        const restored = createConversation({ directory, safeStorage }); await restored.ready;
        assert.equal(restored.snapshot().transcript, store.snapshot().transcript);
        assert.match(restored.snapshot().transcript, /开头要保留/); assert.match(restored.snapshot().transcript, /结尾要保留/);
        await fs.writeFile(path.join(directory, 'ai-conversation.json'), 'broken history');
        const broken = createConversation({ directory, safeStorage }); await broken.ready;
        assert.throws(() => broken.snapshot(), /原文件已保留/); assert.equal(await fs.readFile(path.join(directory, 'ai-conversation.json'), 'utf8'), 'broken history');
        await broken.reset(); assert.equal(broken.snapshot().transcript, '');
    } finally { await cleanup(directory); }
});
