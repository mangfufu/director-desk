const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { complete, validateProfile, appendResult, requestBody, readStream } = require('../desktop/providers.cjs');
const definition = { name: 'director_read', description: 'Read', inputSchema: { type: 'object', properties: {}, additionalProperties: false } };
async function mock(run, handler) {
    const server = http.createServer(async (req, res) => { let body = ''; for await (const chunk of req) body += chunk; handler(req, res, body ? JSON.parse(body) : {}); });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    try { await run(`http://127.0.0.1:${server.address().port}/v1`); } finally { server.closeAllConnections(); await new Promise(r => server.close(r)); }
}
const profile = (baseUrl, protocol, stream = false) => ({ baseUrl, protocol, model: 'mock-flash', maxTokens: 4096, stream });
const call = (p, options = {}, signal = new AbortController().signal) => complete(p, 'mock-credential', 'system', [{ role: 'user', content: 'test' }], [definition], signal, options);
const chat = { choices: [{ finish_reason: 'tool_calls', message: { role: 'assistant', content: null, tool_calls: [{ id: 'call-1', type: 'function', function: { name: definition.name, arguments: '{}' } }] } }], usage: { total_tokens: 10 } };
const responses = { status: 'completed', output: [{ type: 'function_call', call_id: 'call-1', name: definition.name, arguments: '{}' }], usage: { total_tokens: 10 } };
const anthropic = { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'call-1', name: definition.name, input: {} }], usage: { input_tokens: 5, output_tokens: 5 } };
for (const protocol of ['chat', 'responses', 'anthropic']) test(`${protocol}: correct endpoint, credentials, tool schema and correlated result`, async () => {
    await mock(async url => {
        const result = await call(profile(url, protocol)); assert.deepEqual(result.calls, [{ id: 'call-1', name: definition.name, args: {} }]);
        const messages = []; appendResult(protocol, messages, result, [{ id: 'call-1', result: { ok: true, data: {} } }]);
        const last = messages.at(-1); assert.equal(protocol === 'chat' ? last.tool_call_id : protocol === 'responses' ? last.call_id : last.content[0].tool_use_id, 'call-1');
    }, (req, res, body) => {
        assert.equal(req.url, '/v1/' + ({ chat: 'chat/completions', responses: 'responses', anthropic: 'messages' }[protocol]));
        assert.equal(req.headers[protocol === 'anthropic' ? 'x-api-key' : 'authorization'], (protocol === 'anthropic' ? '' : 'Bearer ') + 'mock-credential');
        assert.equal(body.model, 'mock-flash'); assert.equal(body.tools.length, 1); res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ chat, responses, anthropic }[protocol]));
    });
});
for (const protocol of ['chat', 'responses', 'anthropic']) for (const stream of [false, true]) {
    test(`${protocol} ${stream ? 'SSE' : 'JSON'}: duplicate call IDs reject the whole response; distinct IDs remain unchanged`, async () => {
        for (const duplicate of [true, false]) {
            const ids = ['first', duplicate ? 'first' : 'second'];
            const args = [{ sections: ['entities'] }, { sections: ['selection'] }];
            const raw = structuredClone({ chat, responses, anthropic }[protocol]);
            if (protocol === 'chat') raw.choices[0].message.tool_calls = ids.map((id, i) => ({ id, type: 'function', function: { name: definition.name, arguments: JSON.stringify(args[i]) } }));
            else if (protocol === 'responses') raw.output = ids.map((call_id, i) => ({ type: 'function_call', call_id, name: definition.name, arguments: JSON.stringify(args[i]) }));
            else raw.content = ids.map((id, i) => ({ type: 'tool_use', id, name: definition.name, input: args[i] }));
            await mock(async url => {
                if (duplicate) await assert.rejects(call(profile(url, protocol, stream)), e => e.code === 'DUPLICATE_TOOL_IDS' && JSON.stringify(e.usage) === JSON.stringify(raw.usage));
                else {
                    const result = await call(profile(url, protocol, stream));
                    assert.deepEqual(result.calls.map(c => c.id), ids);
                    assert.deepEqual(result.calls.map(c => c.args), args);
                }
            }, (_req, res) => {
                if (!stream) return res.end(JSON.stringify(raw));
                const events = protocol === 'chat'
                    ? [{ choices: [{ delta: { tool_calls: raw.choices[0].message.tool_calls.map((c, index) => ({ ...c, index })) }, finish_reason: 'tool_calls' }], usage: raw.usage }]
                    : protocol === 'responses' ? [{ type: 'response.completed', response: raw }]
                    : [{ type: 'message_start', message: { usage: raw.usage } }, ...raw.content.map((content_block, index) => ({ type: 'content_block_start', index, content_block })), { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: raw.usage }, { type: 'message_stop' }];
                res.setHeader('content-type', 'text/event-stream');
                const body = events.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('');
                for (let i = 0; i < body.length; i += 11) res.write(body.slice(i, i + 11));
                res.end();
            });
        }
    });
}

test('Production accepts user-selected models and large limits without old Flash policy', () => {
    for (const model of ['deepseek-v4-pro', 'deepseek-chat', 'flash-pro']) assert.equal(validateProfile({ ...profile('https://api.deepseek.com/v1', 'chat'), model, flashOnly: true }).model, model);
    const defaults = validateProfile({ baseUrl: 'https://api.deepseek.com/v1', protocol: 'chat', model: 'deepseek-v4-pro' });
    assert.equal(defaults.maxTokens, 0); assert.equal(defaults.maxRounds, 64); assert.equal(defaults.flashOnly, undefined);
    assert.equal(validateProfile({ ...defaults, maxTokens: 1000000, maxRounds: 1024 }).maxRounds, 1024);
    assert.equal(validateProfile({ ...defaults, maxRounds: 0 }).maxRounds, 0);
    assert.throws(() => validateProfile({ ...defaults, maxTokens: -1 }));
    assert.throws(() => validateProfile(profile('http://example.com/v1', 'chat')), /HTTPS/);
    assert.throws(() => validateProfile(profile('https://name:pass@example.com/v1', 'chat')), /账号/);
});
test('Auto output uses model output metadata, never context capacity; explicit values override', async () => {
    await mock(async url => {
        await call({ ...profile(url, 'chat'), maxTokens: 0 });
        await call({ ...profile(url, 'chat'), maxTokens: 90000 });
    }, (req, res, body) => {
        if (req.method === 'GET') return res.end(JSON.stringify({ id: 'mock-flash', max_input_tokens: 1000000, max_tokens: 131072 }));
        assert.ok([131072, 90000].includes(body.max_tokens)); res.end(JSON.stringify(chat));
    });
    await mock(async url => { await call({ ...profile(url, 'responses'), maxTokens: 0 }); }, (req, res, body) => {
        if (req.method === 'GET') return res.end(JSON.stringify({ context_length: 1000000 }));
        assert.equal(Object.hasOwn(body, 'max_output_tokens'), false); res.end(JSON.stringify(responses));
    });
    await mock(async url => { await call({ ...profile(url, 'anthropic'), maxTokens: 0 }); }, (req, res, body) => {
        if (req.method === 'GET') return res.end(JSON.stringify({ max_input_tokens: 1000000, max_tokens: 128000 }));
        assert.equal(body.max_tokens, 128000); res.end(JSON.stringify(anthropic));
    });
    await mock(async url => { await assert.rejects(call({ ...profile(url, 'anthropic'), maxTokens: 0 }), /手动填写/); }, (req, res) => {
        assert.equal(req.method, 'GET'); res.writeHead(404).end();
    });
});
test('Official DeepSeek max output resolves without a paid call; thinking history survives', async () => {
    const { automaticOutputLimit } = require('../desktop/model-limits.cjs');
    const p = { ...profile('https://api.deepseek.com/v1', 'chat'), model: 'deepseek-v4-pro' };
    assert.equal(await automaticOutputLimit(p, '', new AbortController().signal), 384000);
    const body = requestBody(p, 's', [{ role: 'assistant', content: null, reasoning_content: 'retained', tool_calls: [{ id: 'a' }] }], [], 384000, true);
    assert.equal(body.messages[1].content, ''); assert.equal(body.messages[1].reasoning_content, 'retained'); assert.equal(body.thinking, undefined);
});
const events = {
    chat: [{ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call-1', function: { name: definition.name, arguments: '{' } }] } }] }, { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '}' } }] }, finish_reason: 'tool_calls' }] }],
    responses: [{ type: 'response.completed', response: responses }],
    anthropic: [{ type: 'message_start', message: { usage: { input_tokens: 5 } } }, { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'call-1', name: definition.name, input: {} } }, { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{}' } }, { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 5 } }, { type: 'message_stop' }],
};
for (const protocol of Object.keys(events)) test(`${protocol}: fragmented streaming tool JSON and interrupted stream`, async () => {
    await mock(async url => { const result = await call(profile(url, protocol, true)); assert.deepEqual(result.calls[0].args, {}); }, (_req, res) => {
        res.setHeader('content-type', 'text/event-stream'); const stream = events[protocol].map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('');
        for (let i = 0; i < stream.length; i += 3) res.write(stream.slice(i, i + 3)); res.end();
    });
    await mock(async url => { await assert.rejects(call(profile(url, protocol, true)), /中断/); }, (_req, res) => { res.setHeader('content-type', 'text/event-stream'); res.end('data: [DONE]\n\n'); });
});
test('HTTP errors never echo server response secrets; truncated output never executes tools', async () => {
    await mock(async url => { await assert.rejects(call(profile(url, 'chat')), e => e.message.includes('HTTP 401') && !e.message.includes('private-server-value')); }, (_req, res) => res.writeHead(401).end('private-server-value'));
    await mock(async url => { await assert.rejects(call(profile(url, 'chat')), e => e.code === 'INCOMPLETE_OUTPUT' && e.finishReason === 'length' && e.usage.total_tokens === 10 && /截断/.test(e.message)); }, (_req, res) => res.end(JSON.stringify({ ...chat, choices: [{ ...chat.choices[0], finish_reason: 'length' }] })));
    await mock(async url => { await assert.rejects(call(profile(url, 'chat')), e => !e.message.includes('private-server-value')); }, (_req, res) => res.end('private-server-value'));
});
test('Stop aborts an outstanding request without retry or fallback', async () => {
    let calls = 0, received;
    const started = new Promise(resolve => { received = resolve; });
    await mock(async url => {
        const controller = new AbortController();
        const rejected = assert.rejects(call(profile(url, 'chat'), {}, controller.signal), { name: 'AbortError' });
        await started; controller.abort(); await rejected;
    }, () => { calls++; received(); });
    assert.equal(calls, 1);
});


for (const protocol of ['chat', 'responses', 'anthropic']) test(`${protocol}: malformed tool arguments reject the entire response before execution`, async () => {
    const broken = structuredClone({ chat, responses, anthropic }[protocol]);
    if (protocol === 'chat') broken.choices[0].message.tool_calls.push({ id: 'bad', function: { name: 'director_apply', arguments: '{"private-payload":' } });
    else if (protocol === 'responses') broken.output.push({ type: 'function_call', call_id: 'bad', name: 'director_apply', arguments: '{"private-payload":' });
    else broken.content.push({ type: 'tool_use', id: 'bad', name: 'director_apply', input: [] });
    await mock(async url => {
        await assert.rejects(call(profile(url, protocol)), e => e.code === 'INVALID_TOOL_ARGUMENTS' && JSON.stringify(e.usage) === JSON.stringify(broken.usage) && !e.message.includes('private-payload'));
    }, (_req, res) => res.end(JSON.stringify(broken)));
});

for (const protocol of Object.keys(events)) test(`${protocol}: final SSE event without newline is retained`, async () => {
    await mock(async url => {
        const result = await call(profile(url, protocol, true)); assert.deepEqual(result.calls[0].args, {});
    }, (_req, res) => {
        res.setHeader('content-type', 'text/event-stream');
        res.end(events[protocol].map(e => 'data: ' + JSON.stringify(e)).join('\n\n'));
    });
});

test('Anthropic invalid streamed tool JSON is repairable only after a complete tool turn', async () => {
    for (const stop of ['tool_use', 'max_tokens']) {
        const broken = structuredClone(events.anthropic); broken[2].delta.partial_json = '{"private-payload":'; broken[3].delta.stop_reason = stop;
        await mock(async url => {
            await assert.rejects(call(profile(url, 'anthropic', true)), e => e.usage.input_tokens === 5 && e.usage.output_tokens === 5 && (stop === 'tool_use' ? e.code === 'INVALID_TOOL_ARGUMENTS' : e.code === 'INCOMPLETE_OUTPUT' && e.finishReason === stop && /截断/.test(e.message)));
        }, (_req, res) => res.end(broken.map(e => 'data: ' + JSON.stringify(e)).join('\n\n')));
    }
});

test('large SSE envelope overhead does not truncate small valid content, while payload and unfinished lines stay bounded', async () => {
    const encoder = new TextEncoder();
    const response = chunks => new Response(new ReadableStream({ start(controller) { for (const chunk of chunks) controller.enqueue(encoder.encode(chunk)); controller.close(); } }));
    const event = value => 'data: ' + JSON.stringify(value) + '\n\n';
    const repeated = event({ padding: 'x'.repeat(20000), choices: [{ delta: { reasoning_content: 'thinking ' } }] });
    const final = event({ choices: [{ delta: { content: 'done' }, finish_reason: 'stop' }], usage: { total_tokens: 450 } });
    const raw = await readStream(response([...Array(450).fill(repeated), final]), 'chat', () => {});
    assert.equal(raw.choices[0].message.content, 'done'); assert.equal(raw.usage.total_tokens, 450);
    const content = event({ choices: [{ delta: { reasoning_content: 'x'.repeat(100000) } }] });
    await assert.rejects(readStream(response(Array(81).fill(content)), 'chat', () => {}), /模型内容超过/);
    await assert.rejects(readStream(response(['data: ' + 'x'.repeat(8_000_001)]), 'chat', () => {}), /单条流消息/);
});

test('stream activity distinguishes reasoning and tools without exposing thinking; Anthropic signed blocks survive replay', async () => {
    const sse = events => new Response(events.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join(''));
    const activity = [], text = [];
    const chat = await readStream(sse([
        { choices: [{ delta: { reasoning_content: 'private-thought' } }] },
        { choices: [{ delta: { reasoning_content: '-continued' } }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, id: 'tool-1', function: { name: 'director_read', arguments: '{}' } }] }, finish_reason: 'tool_calls' }] },
    ]), 'chat', t => text.push(t), a => activity.push(a));
    assert.deepEqual(activity, ['thinking', 'tools']); assert.deepEqual(text, []);
    assert.equal(chat.choices[0].message.reasoning_content, 'private-thought-continued');
    activity.length = 0;
    const anthropic = await readStream(sse([
        { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'retained-thought' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'opaque-signature' } },
        { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 't1', name: 'director_read', input: {} } },
        { type: 'message_delta', delta: { stop_reason: 'tool_use' } }, { type: 'message_stop' },
    ]), 'anthropic', () => {}, a => activity.push(a));
    assert.deepEqual(anthropic.content[0], { type: 'thinking', thinking: 'retained-thought', signature: 'opaque-signature' });
    assert.deepEqual(activity, ['thinking', 'tools']);
    const history = [];
    appendResult('anthropic', history, { assistant: { role: 'assistant', content: anthropic.content } }, [{ id: 't1', result: { ok: true } }]);
    assert.deepEqual(history[0].content[0], anthropic.content[0]);
    activity.length = 0;
    await readStream(sse([
        { type: 'response.reasoning_summary_text.delta', delta: 'reasoning' },
        { type: 'response.function_call_arguments.delta', delta: '{}' },
        { type: 'response.completed', response: { status: 'completed', output: [] } },
    ]), 'responses', () => {}, a => activity.push(a));
    assert.deepEqual(activity, ['thinking', 'tools']);
});
