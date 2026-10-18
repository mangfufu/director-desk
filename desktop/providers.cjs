const { automaticOutputLimit } = require('./model-limits.cjs');
function parseJson(text) { try { return JSON.parse(text); } catch { throw new Error('渠道返回了无效 JSON 响应，未执行本轮工具调用'); } }
function toolArguments(value, encoded = true) {
    try {
        const args = encoded ? JSON.parse(value) : value;
        if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error();
        return args;
    } catch {
        const error = new Error('模型工具参数不是有效的 JSON 对象，本轮所有工具均未执行');
        error.code = 'INVALID_TOOL_ARGUMENTS';
        throw error;
    }
}
function incompleteOutput(reason, usage = {}) {
    const limited = ['length', 'max_tokens', 'max_output_tokens'].includes(reason);
    const error = new Error(limited ? '模型达到输出额度而截断，未执行本轮工具；请拆分操作批次或调整输出额度'
        : '模型输出未完整结束，未执行本轮工具' + (reason ? `（结束原因：${reason}）` : ''));
    error.code = 'INCOMPLETE_OUTPUT'; error.finishReason = reason; error.usage = usage; return error;
}
async function readJson(response) {
    let text = '', size = 0;
    for await (const chunk of response.body.pipeThrough(new TextDecoderStream())) { size += chunk.length; if (size > 8_000_000) throw new Error('模型响应超过本次限制'); text += chunk; }
    return parseJson(text);
}
function validateProfile(profile) {
    if (!profile || typeof profile !== 'object' || !['chat', 'responses', 'anthropic'].includes(profile.protocol)) throw new Error('请选择有效接口协议');
    let url; try { url = new URL(profile.baseUrl); } catch { throw new Error('API 地址无效'); }
    if (url.username || url.password || url.search || url.hash || !['http:', 'https:'].includes(url.protocol)) throw new Error('API 地址不能包含账号、查询参数或片段');
    if (url.protocol !== 'https:' && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('远程 API 必须使用 HTTPS');
    if (typeof profile.model !== 'string' || !profile.model.trim() || profile.model.length > 150) throw new Error('请填写模型 ID');
    const maxTokens = profile.maxTokens ?? 0, maxRounds = profile.maxRounds ?? 64;
    if (!Number.isSafeInteger(maxTokens) || maxTokens < 0 || !Number.isSafeInteger(maxRounds) || maxRounds < 0) throw new Error('输出额度和轮数需为非负整数；0 分别表示自动输出额度和不限轮数');
    return { id: String(profile.id || ''), name: String(profile.name || '自定义渠道').slice(0, 80), protocol: profile.protocol,
        baseUrl: url.href.replace(/\/$/, ''), model: profile.model.trim(), stream: profile.stream !== false, maxTokens, maxRounds };
}
function endpoint(profile) {
    const suffix = { chat: '/chat/completions', responses: '/responses', anthropic: '/messages' }[profile.protocol];
    return profile.baseUrl.endsWith(suffix) ? profile.baseUrl : profile.baseUrl + suffix;
}
function requestBody(profile, system, messages, tools, maxTokens, stream) {
    const base = { model: profile.model, stream };
    if (profile.protocol === 'anthropic') {
        if (!maxTokens) throw new Error('此 Anthropic 兼容渠道没有返回模型最大输出额度，请在渠道设置中手动填写服务商支持的值');
        return { ...base, system, messages, max_tokens: maxTokens,
        ...(tools.length ? { tools: tools.map(t => ({ name: t.name, description: t.description, input_schema: t.inputSchema })) } : {}) };
    }
    if (profile.protocol === 'responses') return { ...base, instructions: system, input: messages, ...(maxTokens ? { max_output_tokens: maxTokens } : {}), store: false,
        ...(tools.length ? { tools: tools.map(t => ({ type: 'function', name: t.name, description: t.description, parameters: t.inputSchema, strict: false })) } : {}) };
    const host = new URL(profile.baseUrl).hostname;
    const tokenField = host === 'api.openai.com' ? 'max_completion_tokens' : 'max_tokens';
    const history = host === 'api.deepseek.com' ? messages.map(m => m.role === 'assistant' && m.tool_calls?.length ? { ...m, content: m.content ?? '', reasoning_content: m.reasoning_content ?? '' } : m) : messages;
    const body = { ...base, messages: [{ role: 'system', content: system }, ...history], ...(maxTokens ? { [tokenField]: maxTokens } : {}),
        ...(tools.length ? { tools: tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.inputSchema } })) } : {}) };
    return body;
}
async function readStream(response, protocol, onText, onActivity = () => {}) {
    let buffer = '', payloadSize = 0, final, finish, usage = {}, blocks = [], calls = [], text = '', reasoning = '';
    let activity;
    const active = next => { if (activity !== next) { activity = next; onActivity(next); } };
    // SSE envelopes repeat for every token. Limit retained model content, not wire overhead.
    const maxPayload = 8_000_000;
    const account = value => { if (typeof value === 'string') payloadSize += value.length; if (payloadSize > maxPayload) throw new Error('模型内容超过本次读取限制，未执行本轮工具'); };
    // A complete final data line may arrive without a trailing newline.
    async function* chunks() { yield* response.body.pipeThrough(new TextDecoderStream()); yield '\n'; }
    try { for await (const chunk of chunks()) {
        buffer += chunk;
        const lines = buffer.split('\n'); buffer = lines.pop();
        if (buffer.length > maxPayload) throw new Error('模型单条流消息超过读取限制，未执行本轮工具');
        for (const raw of lines) {
            const line = raw.trim(); if (!line.startsWith('data:')) continue;
            const value = line.slice(5).trim(); if (!value || value === '[DONE]') continue;
            if (value.length > maxPayload) throw new Error('模型单条流消息超过读取限制，未执行本轮工具');
            let data; try { data = JSON.parse(value); } catch { throw new Error('模型返回了无效流式 JSON'); }
            if (data.error || data.type === 'error') throw new Error('模型流式响应报告错误');
            if (protocol === 'chat') {
                usage = data.usage || usage; const choice = data.choices?.[0]; if (!choice) continue;
                finish = choice.finish_reason || finish; const delta = choice.delta || {};
                account(delta.content); account(delta.reasoning_content);
                if (delta.reasoning_content) active('thinking');
                if (delta.content) active('text');
                if (delta.tool_calls?.length) active('tools');
                if (delta.content) { text += delta.content; onText(delta.content); } if (delta.reasoning_content) reasoning += delta.reasoning_content;
                for (const call of delta.tool_calls || []) { const at = call.index; if (!Number.isInteger(at) || at < 0 || at > 100) throw new Error('无效工具流');
                    account(call.function?.name); account(call.function?.arguments);
                    calls[at] ||= { id: '', type: 'function', function: { name: '', arguments: '' } };
                    if (call.id) calls[at].id = call.id; if (call.function?.name) calls[at].function.name += call.function.name; if (call.function?.arguments) calls[at].function.arguments += call.function.arguments; }
            } else if (protocol === 'responses') {
                if (data.type?.startsWith('response.reasoning')) active('thinking');
                if (data.type === 'response.output_text.delta') active('text');
                if (data.type === 'response.function_call_arguments.delta') active('tools');
                if (data.type?.endsWith('.delta')) account(data.delta);
                if (data.type === 'response.output_text.delta') onText(data.delta);
                if (data.type === 'response.completed') final = data.response;
                if (['response.failed', 'response.incomplete'].includes(data.type)) throw incompleteOutput(data.response?.incomplete_details?.reason || data.type, data.response?.usage || {});
            } else {
                if (data.type === 'message_start') usage = data.message?.usage || {};
                if (data.type === 'content_block_start') { account(data.content_block?.text); blocks[data.index] = { ...data.content_block, partial: '' };
                    if (['thinking', 'redacted_thinking'].includes(data.content_block?.type)) active('thinking');
                    if (data.content_block?.type === 'tool_use') active('tools');
                }
                if (data.type === 'content_block_delta') {
                    const block = blocks[data.index]; if (!block) throw new Error('工具流顺序错误');
                    account(data.delta.text); account(data.delta.partial_json);
                    if (data.delta.type === 'text_delta') { active('text'); block.text = (block.text || '') + data.delta.text; onText(data.delta.text); }
                    if (data.delta.type === 'input_json_delta') block.partial += data.delta.partial_json;
                    if (data.delta.type === 'thinking_delta') { active('thinking'); account(data.delta.thinking); block.thinking = (block.thinking || '') + data.delta.thinking; }
                    if (data.delta.type === 'signature_delta') { account(data.delta.signature); block.signature = (block.signature || '') + data.delta.signature; }
                }
                if (data.type === 'message_delta') { finish = data.delta?.stop_reason || finish; usage = { ...usage, ...data.usage }; }
                if (data.type === 'message_stop') final = { content: blocks.map(({ partial, ...b }) => b.type === 'tool_use' && partial && ['end_turn', 'tool_use'].includes(finish) ? { ...b, input: toolArguments(partial) } : b), stop_reason: finish, usage };
            }
        }
    } } catch (error) { error.usage ??= usage; error.finishReason ??= finish; throw error; }
    if (protocol === 'chat' && finish) return { choices: [{ message: { role: 'assistant', content: text || null, ...(reasoning ? { reasoning_content: reasoning } : {}), ...(calls.length ? { tool_calls: calls } : {}) }, finish_reason: finish }], usage };
    if (!final) { const error = new Error('连接中断，未执行不完整的工具调用'); error.usage = usage; throw error; } return final;
}
async function complete(profileInput, key, system, messages, tools, signal, options = {}) {
    const profile = validateProfile(profileInput), stream = options.stream ?? profile.stream;
    const maxTokens = options.maxTokens ?? (profile.maxTokens || await automaticOutputLimit(profile, key, signal));
    const body = requestBody(profile, system, messages, tools, maxTokens, stream);
    const headers = { 'content-type': 'application/json' };
    if (profile.protocol === 'anthropic') { headers['x-api-key'] = key; headers['anthropic-version'] = '2023-06-01'; }
    else if (key) headers.authorization = 'Bearer ' + key;
    let response;
    try { response = await fetch(endpoint(profile), { method: 'POST', headers, body: JSON.stringify(body), signal, redirect: 'error' }); }
    catch (e) { if (signal.aborted) throw new DOMException('已停止', 'AbortError'); throw new Error(e.name === 'TimeoutError' ? '模型请求超时' : '无法连接该渠道，请检查地址和网络'); }
    if (!response.ok) { await response.body?.cancel(); throw new Error(`API 请求失败（HTTP ${response.status}）；请检查密钥、额度、模型和协议`); }
    const raw = stream ? await readStream(response, profile.protocol, options.onText || (() => {}), options.onActivity) : await readJson(response);
    try {
    let text = '', calls = [], assistant;
    if (profile.protocol === 'chat') {
        const choice = raw.choices?.[0]; if (!choice || !['stop', 'tool_calls'].includes(choice.finish_reason)) throw incompleteOutput(choice?.finish_reason, raw.usage);
        assistant = choice.message; text = assistant.content || ''; calls = (assistant.tool_calls || []).map(c => ({ id: c.id, name: c.function.name, args: toolArguments(c.function.arguments) }));
    } else if (profile.protocol === 'responses') {
        if (raw.status !== 'completed') throw incompleteOutput(raw.incomplete_details?.reason || raw.status, raw.usage); assistant = raw.output;
        text = (raw.output || []).filter(o => o.type === 'message').flatMap(o => o.content || []).filter(c => c.type === 'output_text').map(c => c.text).join('');
        calls = (raw.output || []).filter(o => o.type === 'function_call').map(c => ({ id: c.call_id, name: c.name, args: toolArguments(c.arguments) }));
    } else {
        if (!['end_turn', 'tool_use'].includes(raw.stop_reason)) throw incompleteOutput(raw.stop_reason, raw.usage); assistant = { role: 'assistant', content: raw.content };
        text = raw.content.filter(c => c.type === 'text').map(c => c.text).join(''); calls = raw.content.filter(c => c.type === 'tool_use').map(c => ({ id: c.id, name: c.name, args: toolArguments(c.input, false) }));
    }
    if (!stream && text) options.onText?.(text);
    if (calls.length > 100 || calls.some(c => typeof c.id !== 'string' || !c.id.trim() || !c.name || !c.args || typeof c.args !== 'object' || Array.isArray(c.args))) throw new Error('无效工具调用');
    // IDs correlate persisted results with calls. Reject the entire response before
    // it can be stored or dispatched; renaming would change the provider's turn.
    if (new Set(calls.map(c => c.id)).size !== calls.length) {
        const error = new Error('模型返回了重复的工具调用标识，本轮工具均未执行，请重试');
        error.code = 'DUPLICATE_TOOL_IDS';
        throw error;
    }
    return { text, calls, assistant, usage: raw.usage || {} };
    } catch (error) { error.usage ??= raw.usage || {}; error.finishReason ??= raw.choices?.[0]?.finish_reason || raw.stop_reason || raw.status; throw error; }
}
function appendResult(protocol, messages, completion, results) {
    if (protocol === 'responses') { messages.push(...completion.assistant); messages.push(...results.map(r => ({ type: 'function_call_output', call_id: r.id, output: JSON.stringify(r.result) }))); }
    else if (protocol === 'anthropic') { messages.push(completion.assistant); if (results.length) messages.push({ role: 'user', content: results.map(r => ({ type: 'tool_result', tool_use_id: r.id, content: JSON.stringify(r.result), is_error: r.result.ok === false })) }); }
    else { messages.push(completion.assistant); messages.push(...results.map(r => ({ role: 'tool', tool_call_id: r.id, content: JSON.stringify(r.result) }))); }
}
module.exports = { validateProfile, endpoint, requestBody, complete, appendResult, readStream };
