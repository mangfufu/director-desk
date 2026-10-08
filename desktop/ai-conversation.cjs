const { randomUUID } = require('node:crypto');
const { appendResult } = require('./providers.cjs');
const { conversationStore } = require('./conversation-store.cjs');

const fresh = () => ({ version: 1, sessionId: randomUUID(), profileId: '', entries: [] });
const missingResult = (turn, call) => ({ id: call.id, result: {
    ok: false, execution: turn.started.includes(call.id) ? 'unknown' : 'not-started',
    error: turn.started.includes(call.id)
        ? '上次任务已开始此调用，但结果未确认。先读取工程和任务状态，不要直接重放写入。'
        : '此调用尚未执行，上次任务在执行前结束。',
} });

/** One durable conversation. Native provider data is retained; protocol conversion is a request view only. */
function createConversation({ directory, safeStorage }) {
    const store = conversationStore(directory, safeStorage);
    let state = fresh(), loadError = '';
    const ready = store.load().then(saved => {
        if (saved.version !== 1 || typeof saved.sessionId !== 'string' || !Array.isArray(saved.entries)
            || saved.entries.some(e => !e || !['user', 'partial', 'notice', 'turn'].includes(e.type) || typeof e.text !== 'string'
                || e.type === 'turn' && (!Array.isArray(e.calls) || !Array.isArray(e.results) || !Array.isArray(e.started)))) throw Error('Invalid conversation');
        state = saved;
    }).catch(error => {
        if (error.code !== 'ENOENT') loadError = '本机会话无法读取，原文件已保留；请恢复文件，或手动点击新对话。';
    });
    const assertLoaded = () => { if (loadError) throw Error(loadError); };
    function save(entry) { assertLoaded(); return store.save(state, entry); }
    function messages(profile) {
        assertLoaded();
        const result = [];
        for (const entry of state.entries) {
            if (entry.type !== 'turn') {
                result.push({ role: entry.type === 'partial' ? 'assistant' : 'user', content: entry.type === 'notice' ? '任务执行状态：' + entry.text : entry.text
                    + (entry.type === 'user' && typeof entry.context === 'string' ? '\n\n' + entry.context : '') });
                continue;
            }
            const outcomes = entry.calls.map(call => entry.results.find(r => r.id === call.id) ?? missingResult(entry, call));
            let assistant = entry.assistant;
            if (entry.protocol !== profile.protocol || entry.profileId !== profile.id || entry.model !== profile.model || entry.baseUrl !== profile.baseUrl) {
                // Signed thinking / response IDs belong to the original provider. Preserve text and complete tool pairs across channels.
                if (profile.protocol === 'chat') assistant = { role: 'assistant', content: entry.text || '', ...(entry.calls.length ? { tool_calls: entry.calls.map(c => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args) } })) } : {}) };
                else if (profile.protocol === 'anthropic') assistant = { role: 'assistant', content: [...(entry.text ? [{ type: 'text', text: entry.text }] : []), ...entry.calls.map(c => ({ type: 'tool_use', id: c.id, name: c.name, input: c.args }))] };
                else assistant = [...(entry.text ? [{ role: 'assistant', content: [{ type: 'output_text', text: entry.text }] }] : []), ...entry.calls.map(c => ({ type: 'function_call', call_id: c.id, name: c.name, arguments: JSON.stringify(c.args) }))];
            }
            appendResult(profile.protocol, result, { assistant }, outcomes);
        }
        return result;
    }
    function snapshot() {
        assertLoaded();
        const transcript = state.entries.map(entry => {
            if (entry.type === 'user') return '\n你：' + entry.text + '\nAI：';
            if (entry.type === 'partial') return entry.text;
            if (entry.type === 'notice') return '\n' + entry.text + '\n';
            return entry.text + entry.calls.map(call => {
                const { result } = entry.results.find(r => r.id === call.id) ?? missingResult(entry, call);
                return `\n[${call.name}：${result.ok ? 'completed' : result.execution ?? 'failed'}]${JSON.stringify(result.data?.summary ?? result.error ?? result.data ?? {})}\n`;
            }).join('');
        }).join('');
        return { sessionId: state.sessionId, profileId: state.profileId, transcript };
    }
    return {
        ready, save, messages, snapshot, assertLoaded,
        get id() { return state.sessionId; },
        hasSkill(version) { return state.entries.findLast(entry => entry.type === 'user' && typeof entry.skillVersion === 'string' && typeof entry.context === 'string')?.skillVersion === version; },
        async start(profile, text) { state.profileId = profile.id; const entry = { type: 'user', text }; state.entries.push(entry); await save(); return entry; },
        async turn(profile, completion) {
            const entry = { type: 'turn', protocol: profile.protocol, profileId: profile.id, model: profile.model, baseUrl: profile.baseUrl,
                text: completion.text, assistant: completion.assistant, calls: completion.calls, started: [], results: [] };
            state.entries.push(entry); await save(); return entry;
        },
        async notice(text) { state.entries.push({ type: 'notice', text }); await save(); },
        async partial(text) { if (text) { state.entries.push({ type: 'partial', text }); await save(); } },
        async reset() { await ready; await store.idle(); const next = fresh(); await store.save(next); state = next; loadError = ''; return snapshot(); },
    };
}
module.exports = { createConversation };
