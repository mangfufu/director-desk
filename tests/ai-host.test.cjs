const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { createAIHost } = require('../desktop/ai-host.cjs');
const { TOOL_DEFINITIONS, DISCUSSION_TOOLS, isDiscussionToolCall } = require('../src/automation/contract.ts');
const toolPolicy = { definitions: TOOL_DEFINITIONS, discussionTools: DISCUSSION_TOOLS, isDiscussionToolCall };

test('task snapshots follow stable system/history prefixes and timing separates model requests from tools', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'director-rounds-'));
    const bodies = []; let revision = 1;
    const server = http.createServer(async (req, res) => {
        let raw = ''; for await (const chunk of req) raw += chunk; bodies.push(JSON.parse(raw));
        setTimeout(() => res.end(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: '完成' } }] })), 15);
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    try {
        const host = createAIHost({ directory, safeStorage: { isEncryptionAvailable: () => false }, ...toolPolicy, send() {}, callTool: async (name, args) => {
            assert.equal(name, 'director_read'); assert.deepEqual(args, { sections: ['entities'] });
            await new Promise(r => setTimeout(r, 10)); return { ok: true, data: { revision } };
        } });
        const [profile] = await host.configure({ baseUrl: `http://127.0.0.1:${server.address().port}/v1`, protocol: 'chat', model: 'mock', stream: false, maxTokens: 1000 });
        const first = await host.run({ profileId: profile.id, prompt: '保留这个要求' }); revision = 2;
        const second = await host.run({ profileId: profile.id, prompt: '继续' });
        assert.equal(first.sessionId, second.sessionId);
        assert.equal(bodies[0].messages[0].content, bodies[1].messages[0].content);
        assert.ok(!bodies[0].messages[0].content.includes('"revision":1'));
        assert.match(bodies[0].messages.at(-1).content, /"revision":1/); assert.match(bodies[1].messages.at(-1).content, /"revision":2/);
        assert.match(JSON.stringify(bodies[1].messages), /保留这个要求/);
        for (const result of [first, second]) {
            assert.equal(result.timing.rounds, 1); assert.equal(result.timing.toolCalls, 1);
            assert.ok(result.timing.modelMs > 0 && result.timing.toolMs > 0);
            assert.ok(result.timing.totalMs >= result.timing.modelMs + result.timing.toolMs);
        }
    } finally { server.closeAllConnections(); await new Promise(r => server.close(r)); await cleanup(directory); }
});
async function cleanup(directory) {
    const resolved = path.resolve(directory);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.match(path.basename(resolved), /^director-(?:config|rounds)-/);
    await fs.rm(resolved, { recursive: true, force: true });
}

test('selected-range tasks read the live scope once and retain it with the task history', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'director-rounds-')), bodies = [], calls = [];
    const selection = { entityIds: ['actor-a'], objects: [{ id: 'actor-a', name: '人物 A' }], clips: [{ kind: 'action', entityId: 'actor-a', id: 'walk-a', start: 2, end: 5 }], timeRange: { start: 2, end: 5 }, scope: 'clips' };
    const server = http.createServer(async (req, res) => {
        let raw = ''; for await (const chunk of req) raw += chunk; bodies.push(JSON.parse(raw));
        res.end(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: '已收到范围' } }] }));
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    try {
        const host = createAIHost({ directory, safeStorage: { isEncryptionAvailable: () => false }, ...toolPolicy, send() {},
            callTool: async (name, args) => { calls.push({ name, args }); return { ok: true, data: { revision: calls.length, ...(args.sections.includes('selection') ? { selection } : { entities: [] }) } }; } });
        const [profile] = await host.configure({ baseUrl: `http://127.0.0.1:${server.address().port}/v1`, protocol: 'chat', model: 'mock', stream: false, maxTokens: 1000 });
        await host.run({ profileId: profile.id, prompt: '只调整这里', useSelection: true });
        assert.deepEqual(calls[0], { name: 'director_read', args: { sections: ['selection'] } });
        assert.match(bodies[0].messages.at(-1).content, /walk-a/); assert.match(bodies[0].messages.at(-1).content, /仅对本次任务有效/);
        await host.run({ profileId: profile.id, prompt: '再看整个戏段', useSelection: false });
        assert.deepEqual(calls[1].args, { sections: ['entities'] });
        assert.doesNotMatch(bodies[1].messages.at(-1).content, /walk-a/);
        assert.match(JSON.stringify(bodies[1].messages), /walk-a/); assert.equal(calls.length, 2);
    } finally { server.closeAllConnections(); await new Promise(r => server.close(r)); await cleanup(directory); }
});

test('enabled skill catalog is lazy, disabling takes effect next task without deleting history', async () => {
    const { createSkillStore } = require('../desktop/skills/store.cjs');
    const { skillPackage } = require('../desktop/skills/package.cjs');
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'director-rounds-')), bodies = [];
    const skill = { name: 'director-desk', version: 'v1', instructions: 'BUILTIN_TEST_BODY' };
    const skills = createSkillStore({ directory, builtin: skill });
    await skills.install(skillPackage([{ path: 'SKILL.md', bytes: Buffer.from('---\nname: custom\ndescription: Custom test skill\n---\nCUSTOM_LAZY_BODY') }]));
    const custom = (await skills.list()).find(s => !s.builtin);
    const server = http.createServer(async (req, res) => {
        let raw = ''; for await (const part of req) raw += part; bodies.push(JSON.parse(raw));
        res.end(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: '完成' } }] }));
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    try {
        const deps = { directory, safeStorage: { isEncryptionAvailable: () => false }, ...toolPolicy, skill, skills, send() {}, callTool: async () => ({ ok: true, data: { revision: 1 } }) };
        let host = createAIHost(deps);
        const [p] = await host.configure({ baseUrl: `http://127.0.0.1:${server.address().port}/v1`, protocol: 'chat', model: 'mock', stream: false, maxTokens: 1000 });
        await host.run({ profileId: p.id, prompt: '第一条要求保留' });
        assert.match(bodies[0].messages.at(-1).content, /Custom test skill/);
        assert.doesNotMatch(JSON.stringify(bodies[0]), /CUSTOM_LAZY_BODY/);
        await skills.enable(custom.id, false); await skills.enable('builtin', false);
        host = createAIHost(deps); await host.run({ profileId: p.id, prompt: '继续' });
        const last = bodies[1].messages.at(-1).content;
        assert.match(last, /历史中的已停用技能不再适用/); assert.match(last, /\[\]$/);
        assert.doesNotMatch(last, /BUILTIN_TEST_BODY|Custom test skill/);
        assert.match(JSON.stringify(bodies[1].messages), /第一条要求保留/);
        assert.match(JSON.stringify(bodies[1].messages), /BUILTIN_TEST_BODY/);
        assert.equal((await host.conversation()).transcript.includes('第一条要求保留'), true);
    } finally { server.closeAllConnections(); await new Promise(r => server.close(r)); await cleanup(directory); }
});
test('embedded skill is inserted once per retained version, survives restart, and refreshes after changes or new chat', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'director-rounds-')), bodies = [];
    const server = http.createServer(async (req, res) => {
        let raw = ''; for await (const part of req) raw += part; bodies.push(JSON.parse(raw));
        res.end(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: '完成' } }] }));
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const deps = { directory, safeStorage: { isEncryptionAvailable: () => false }, ...toolPolicy, send() {}, callTool: async () => ({ ok: true, data: { revision: 1 } }) };
    const skill = version => ({ name: 'director-desk', version, instructions: 'SKILL_BODY_' + version });
    try {
        let host = createAIHost({ ...deps, skill: skill('v1') });
        const [p] = await host.configure({ baseUrl: `http://127.0.0.1:${server.address().port}/v1`, protocol: 'chat', model: 'mock', stream: false, maxTokens: 1000 });
        const run = () => host.run({ profileId: p.id, prompt: '修改当前工程' });
        await run(); await run();
        host = createAIHost({ ...deps, skill: skill('v1') }); await run();
        host = createAIHost({ ...deps, skill: skill('v2') }); await run();
        host = createAIHost({ ...deps, skill: skill('v1') }); await run();
        await host.newConversation(); await run();
        assert.deepEqual(bodies.map(b => (JSON.stringify(b.messages).match(/SKILL_BODY_/g) || []).length), [1, 1, 1, 2, 3, 1]);
        assert.ok(bodies.every(b => !b.messages[0].content.includes('SKILL_BODY_')), 'instructions stay in retained history, not repeated system text');
        assert.ok(!(await host.conversation()).transcript.includes('SKILL_BODY_'), 'internal instructions do not clutter the chat UI');
    } finally { server.closeAllConnections(); await new Promise(r => server.close(r)); await cleanup(directory); }
});
test('revision conflict reaches the model for correction without replaying a successful edit or creating a scene', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'director-rounds-'));
    const calls = []; let requests = 0;
    const server = http.createServer(async (req, res) => {
        let raw = ''; for await (const chunk of req) raw += chunk;
        const body = JSON.parse(raw); requests++;
        const call = (id, name, args) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } });
        let tools = [];
        if (requests === 1) tools = [call('first', 'director_apply', { requestId: 'first', revision: 1 }), call('stale', 'director_apply', { requestId: 'stale', revision: 1 })];
        if (requests === 2) {
            assert.match(body.messages.at(-1).content, /REVISION_CONFLICT/);
            tools = [call('read-fresh', 'director_read', {})];
        }
        if (requests === 3) tools = [call('corrected', 'director_apply', { requestId: 'corrected', revision: 2 })];
        res.end(JSON.stringify({ choices: [{ finish_reason: tools.length ? 'tool_calls' : 'stop', message: { role: 'assistant', content: tools.length ? '' : '已在当前场修改', ...(tools.length ? { tool_calls: tools } : {}) } }] }));
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    try {
        const host = createAIHost({ directory, safeStorage: { isEncryptionAvailable: () => false }, ...toolPolicy, send() {},
            callTool: async (name, args) => {
                calls.push({ name, ...args });
                return args.requestId === 'stale' ? { ok: false, error: 'REVISION_CONFLICT', revision: 2 } : { ok: true, data: { revision: 2 } };
            } });
        const [p] = await host.configure({ baseUrl: `http://127.0.0.1:${server.address().port}/v1`, protocol: 'chat', model: 'mock', stream: false, maxTokens: 1000 });
        const result = await host.run({ profileId: p.id, prompt: '修改当前人物走位' });
        assert.equal(result.stopped, undefined, (await host.conversation()).transcript); assert.equal(requests, 4);
        assert.deepEqual(calls.map(c => c.requestId || c.name), ['director_read', 'first', 'stale', 'director_read', 'corrected']);
        assert.match((await host.conversation()).transcript, /REVISION_CONFLICT/);
    } finally { server.closeAllConnections(); await new Promise(r => server.close(r)); await cleanup(directory); }
});
test('task snapshot stays before tool turns, survives restart, and is not reinserted after newer tool results', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'director-rounds-'));
    const bodies = []; let revision = 1;
    const server = http.createServer(async (req, res) => {
        let raw = ''; for await (const chunk of req) raw += chunk;
        const body = JSON.parse(raw); bodies.push(body);
        const first = bodies.length === 1;
        res.end(JSON.stringify({ choices: [{ finish_reason: first ? 'tool_calls' : 'stop', message: { role: 'assistant', content: first ? '' : '完成',
            ...(first ? { tool_calls: [{ id: 'edit-1', function: { name: 'director_apply', arguments: '{}' } }] } : {}) } }] }));
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const dependencies = { directory, safeStorage: { isEncryptionAvailable: () => false }, ...toolPolicy, send() {}, callTool: async name => {
        if (name === 'director_apply') revision++;
        return { ok: true, data: { revision } };
    } };
    try {
        let host = createAIHost(dependencies);
        const [profile] = await host.configure({ baseUrl: `http://127.0.0.1:${server.address().port}/v1`, protocol: 'chat', model: 'mock', stream: false, maxTokens: 1000 });
        await host.run({ profileId: profile.id, prompt: '修改站位' });
        assert.deepEqual(bodies[1].messages.slice(0, bodies[0].messages.length), bodies[0].messages);
        assert.equal(bodies[1].messages.at(-1).role, 'tool');
        assert.equal(JSON.parse(bodies[1].messages.at(-1).content).data.revision, 2);
        assert.equal(bodies[1].messages.filter(m => m.content?.includes('任务开始时自动读取')).length, 1);
        host = createAIHost(dependencies);
        await host.run({ profileId: profile.id, prompt: '继续' });
        assert.deepEqual(bodies[2].messages.slice(0, bodies[1].messages.length), bodies[1].messages);
        assert.equal(bodies[2].messages.filter(m => m.content?.includes('任务开始时自动读取')).length, 2);
        assert.ok(!(await host.conversation()).transcript.includes('任务开始时自动读取'), 'internal context is not displayed as user text');
    } finally { server.closeAllConnections(); await new Promise(r => server.close(r)); await cleanup(directory); }
});
test('Old test defaults migrate once, preserving custom settings and encrypted credentials', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'director-config-'));
    const common = { protocol: 'chat', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-v4-pro', flashOnly: true };
    try {
        await fs.writeFile(path.join(directory, 'ai-channels.json'), JSON.stringify({ profiles: [{ ...common, id: 'old', maxTokens: 2048, maxRounds: 16, encryptedKey: 'encrypted-fixture' }, { ...common, id: 'custom', maxTokens: 8192, maxRounds: 24 }] }));
        const deps = { directory, safeStorage: { isEncryptionAvailable: () => true, decryptString: () => 'mock-secret' }, ...toolPolicy, callTool: async () => ({ ok: true }), send() {} };
        const host = createAIHost(deps); const profiles = await host.list();
        assert.equal(profiles[0].maxTokens, 0); assert.equal(profiles[0].maxRounds, 64); assert.equal(profiles[0].hasKey, true);
        assert.equal(profiles[1].maxTokens, 8192); assert.equal(profiles[1].maxRounds, 24);
        const saved = JSON.parse(await fs.readFile(path.join(directory, 'ai-channels.json'), 'utf8'));
        assert.equal(saved.version, 2); assert.equal(saved.profiles[0].encryptedKey, 'encrypted-fixture'); assert.equal(saved.profiles[0].flashOnly, undefined);
        assert.ok(!JSON.stringify(saved).includes('mock-secret'));
        await host.configure({ ...profiles[0], maxTokens: 2048, maxRounds: 16 });
        assert.equal((await createAIHost(deps).list())[1].maxRounds, 16);
    } finally { await cleanup(directory); }
});
test('Unlimited task continues beyond 64 rounds and explicit Stop interrupts it', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'director-rounds-')); let requests = 0, host;
    const server = http.createServer(async (req, res) => {
        let raw = ''; for await (const chunk of req) raw += chunk; const body = JSON.parse(raw);
        assert.equal(body.max_tokens, 50000); requests++;
        res.end(JSON.stringify({ choices: [{ finish_reason: 'tool_calls', message: { role: 'assistant', content: '', tool_calls: [{ id: 'c' + requests, function: { name: 'director_read', arguments: '{}' } }] } }] }));
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    try {
        host = createAIHost({ directory, safeStorage: { isEncryptionAvailable: () => false }, ...toolPolicy,
            callTool: async () => { if (requests === 70) host.stop(); return { ok: true, data: {} }; }, send() {} });
        const [p] = await host.configure({ baseUrl: `http://127.0.0.1:${server.address().port}/v1`, protocol: 'chat', model: 'mock', maxTokens: 50000, maxRounds: 0, stream: false });
        const result = await host.run({ profileId: p.id, prompt: 'test', mode: 'execute' }); assert.equal(requests, 70); assert.equal(result.stopped, true);
    } finally { host?.stop(); server.closeAllConnections(); await new Promise(r => server.close(r)); await cleanup(directory); }
});

test('Discussion can query scene history but rejects forged scene mutations before execution', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'director-rounds-'));
    let requested = { action: 'list' }, host;
    const calls = [], events = [];
    const server = http.createServer(async (req, res) => {
        let raw = ''; for await (const chunk of req) raw += chunk;
        const body = JSON.parse(raw);
        const sceneTool = body.tools.find(t => t.function.name === 'director_scene');
        assert.deepEqual(sceneTool.function.parameters.properties.action.enum, ['list', 'read']);
        assert.ok(body.tools.some(t => t.function.name === 'director_continuity'));
        assert.ok(!body.tools.some(t => ['director_apply', 'director_job', 'director_history'].includes(t.function.name)));
        const done = body.messages.some(m => m.role === 'tool');
        res.end(JSON.stringify({ choices: [{ finish_reason: done ? 'stop' : 'tool_calls', message: { role: 'assistant', content: done ? '完成查询' : '',
            ...(!done ? { tool_calls: [{ id: 'scene-query', function: { name: 'director_scene', arguments: JSON.stringify(requested) } }] } : {}),
        } }] }));
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    try {
        host = createAIHost({ directory, safeStorage: { isEncryptionAvailable: () => false }, ...toolPolicy,
            callTool: async (name, args) => { calls.push({ name, args }); return { ok: true, data: {} }; }, send: e => events.push(e) });
        const [p] = await host.configure({ baseUrl: `http://127.0.0.1:${server.address().port}/v1`, protocol: 'chat', model: 'mock', maxTokens: 1000, maxRounds: 3, stream: false });
        for (const action of ['list', 'read', 'switch', 'create', 'copy', 'continue', 'rename', 'reorder', 'remove']) {
            await host.newConversation();
            requested = { action, sceneId: 'scene-a' }; calls.length = 0; events.length = 0;
            if (action === 'read') requested = { ...requested, sections: ['production'], ids: ['actor-a'], details: true };
            const result = await host.run({ profileId: p.id, prompt: '查询前情', mode: 'discuss' });
            const allowed = ['list', 'read'].includes(action);
            assert.equal(Boolean(result.stopped), !allowed);
            assert.deepEqual(calls.map(c => c.name), allowed ? ['director_read', 'director_scene'] : ['director_read']);
            if (allowed) assert.deepEqual(calls.at(-1).args, requested);
            if (!allowed) assert.match(events.find(e => e.type === 'error').text, /不允许/);
        }
        for (const args of [null, [], {}, { action: 'list', revision: 1 }, { action: 'remove' }]) assert.equal(isDiscussionToolCall('director_scene', args), false);
        assert.equal(isDiscussionToolCall('director_continuity', {}), true);
        assert.equal(isDiscussionToolCall('unknown', {}), false);
    } finally { host?.stop(); server.closeAllConnections(); await new Promise(r => server.close(r)); await cleanup(directory); }
});


for (const scenario of ['recover', 'persistent', 'cancel', 'round-limit']) test(`invalid tool JSON: ${scenario}, bounded regeneration preserves confirmed writes`, async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'director-rounds-'));
    let requests = 0, host; const writes = [], events = [];
    const server = http.createServer(async (req, res) => {
        let raw = ''; for await (const chunk of req) raw += chunk;
        const body = JSON.parse(raw); requests++;
        assert.equal(body.model, 'mock');
        const validCall = id => ({ id, type: 'function', function: { name: 'director_apply', arguments: JSON.stringify({ requestId: id, revision: 1, operations: [{ operation: 'add', asset: 'person', id }] }) } });
        let tool_calls;
        if (requests === 1) tool_calls = [validCall('confirmed')];
        else if (scenario === 'recover' && requests === 3) {
            assert.match(body.messages.at(-1).content, /上一轮工具参数不是合法 JSON/);
            assert.equal(body.messages.filter(m => m.role === 'tool').length, 1);
            assert.ok(!JSON.stringify(body.messages).includes('invalid-turn'));
            tool_calls = [validCall('recovered')];
        } else if (!(scenario === 'recover' && requests === 4)) tool_calls = [validCall('must-not-run'), { id: 'invalid-turn', type: 'function', function: { name: 'director_apply', arguments: '{' } }];
        res.end(JSON.stringify({ usage: { total_tokens: 10 }, choices: [{ finish_reason: tool_calls ? 'tool_calls' : 'stop', message: { role: 'assistant', content: tool_calls ? '' : '完成', ...(tool_calls ? { tool_calls } : {}) } }] }));
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    try {
        host = createAIHost({ directory, safeStorage: { isEncryptionAvailable: () => false }, ...toolPolicy,
            callTool: async (name, args) => {
                if (name === 'director_apply') writes.push(args.requestId);
                return { ok: true, data: { revision: 1, preview: false, committed: true, message: '本批已提交', summary: { hasChanges: true } } };
            }, send: e => { events.push(e); if (scenario === 'cancel' && e.type === 'status' && e.text.includes('JSON 无效')) host.stop(); } });
        const [p] = await host.configure({ baseUrl: `http://127.0.0.1:${server.address().port}/v1`, protocol: 'chat', model: 'mock', maxTokens: 512, maxRounds: scenario === 'round-limit' ? 2 : 10, stream: false });
        const result = await host.run({ profileId: p.id, prompt: 'test', mode: 'execute' });
        assert.deepEqual(writes, scenario === 'recover' ? ['confirmed', 'recovered'] : ['confirmed']);
        assert.equal(requests, ['cancel', 'round-limit'].includes(scenario) ? 2 : 4);
        assert.equal(Boolean(result.stopped), scenario !== 'recover');
        assert.equal(events.filter(e => e.type === 'usage').reduce((sum, e) => sum + e.usage.total_tokens, 0), requests * 10, 'failed argument turns still report billed usage');
        assert.equal(events.find(e => e.type === 'tool' && e.status === 'completed').summary.committed, true);
        if (scenario === 'persistent') assert.match(events.at(-1).text, /停止自动重试/);
        if (scenario === 'cancel') assert.match(events.at(-1).text, /已停止/);
        if (scenario === 'round-limit') assert.match(events.at(-1).text, /2 轮限制/);
    } finally { host?.stop(); server.closeAllConnections(); await new Promise(r => server.close(r)); await cleanup(directory); }
});


test('tool permissions are checked for the whole response before any proposed edit', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'director-rounds-')); let host;
    const calls = [], events = [];
    const server = http.createServer(async (req, res) => {
        for await (const _ of req) { /* consume body */ }
        res.end(JSON.stringify({ choices: [{ finish_reason: 'tool_calls', message: { role: 'assistant', content: '', tool_calls: [
            { id: 'allowed-first', function: { name: 'director_apply', arguments: JSON.stringify({ revision: 1, requestId: 'must-not-write', operations: [{ operation: 'add', asset: 'person' }] }) } },
            { id: 'forbidden-second', function: { name: 'unknown_tool', arguments: '{}' } },
        ] } }] }));
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    try {
        host = createAIHost({ directory, safeStorage: { isEncryptionAvailable: () => false }, ...toolPolicy,
            callTool: async name => { calls.push(name); return { ok: true, data: { revision: 1 } }; }, send: e => events.push(e) });
        const [p] = await host.configure({ baseUrl: `http://127.0.0.1:${server.address().port}/v1`, protocol: 'chat', model: 'mock', maxTokens: 512, maxRounds: 2, stream: false });
        const result = await host.run({ profileId: p.id, prompt: 'test', mode: 'execute' });
        assert.equal(result.stopped, true); assert.deepEqual(calls, ['director_read']); assert.match(events.at(-1).text, /本轮工具均未执行/);
    } finally { host?.stop(); server.closeAllConnections(); await new Promise(r => server.close(r)); await cleanup(directory); }
});
