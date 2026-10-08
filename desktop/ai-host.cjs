const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { validateProfile, complete } = require('./providers.cjs');
const { createConversation } = require('./ai-conversation.cjs');
const { DIRECTOR_SYSTEM_PROMPT } = require('./director-prompt.cjs');
const { callBatches } = require('./ai-call-batches.cjs');
function createAIHost({ directory, safeStorage, definitions, discussionTools, isDiscussionToolCall, callTool, send, workflow = '', skill, skills }) {
    let profiles = [], running = null; const keys = new Map();
    const conversation = createConversation({ directory, safeStorage });
    const file = path.join(directory, 'ai-channels.json');
    const ready = fs.readFile(file, 'utf8').then(async text => {
        const saved = JSON.parse(text); for (const item of saved.profiles || []) {
            try { const migrated = saved.version === 2 ? item : { ...item, maxTokens: item.maxTokens === 2048 ? 0 : item.maxTokens, maxRounds: item.maxRounds === 16 ? 64 : item.maxRounds };
                const p = validateProfile(migrated); profiles.push({ ...p, encryptedKey: item.encryptedKey }); if (item.encryptedKey && safeStorage.isEncryptionAvailable()) keys.set(p.id, safeStorage.decryptString(Buffer.from(item.encryptedKey, 'base64'))); } catch { /* Invalid/unavailable entries require reconfiguration. */ }
        }
        if (saved.version !== 2) await persist();
    }).catch(() => {});
    const publicProfiles = () => profiles.map(({ encryptedKey: _secret, ...p }) => ({ ...p, hasKey: keys.has(p.id), remembered: Boolean(_secret) }));
    async function persist() { await fs.mkdir(directory, { recursive: true }); const temp = file + '.tmp'; await fs.writeFile(temp, JSON.stringify({ version: 2, profiles }), { mode: 0o600 }); await fs.rename(temp, file); }
    async function configure(input) {
        await ready; if (running) throw new Error('请先停止当前 AI 任务');
        if (input.removeId) { const before = profiles; profiles = profiles.filter(p => p.id !== input.removeId);
            try { await persist(); } catch (e) { profiles = before; throw e; } keys.delete(input.removeId); return publicProfiles(); }
        const profile = validateProfile(input), previous = profiles.find(p => p.id === profile.id); profile.id ||= randomUUID();
        const sameDestination = previous && previous.baseUrl === profile.baseUrl && previous.protocol === profile.protocol;
        let key = typeof input.key === 'string' ? input.key.trim() : '';
        if (!key && sameDestination) key = keys.get(profile.id) || '';
        if (input.remember && key) {
            if (!safeStorage.isEncryptionAvailable()) throw new Error('系统密钥保护不可用，请关闭“记住密钥”并仅本次会话使用');
            profile.encryptedKey = safeStorage.encryptString(key).toString('base64');
        }
        const before = profiles;
        profiles = [...profiles.filter(p => p.id !== profile.id), profile];
        try { await persist(); } catch (e) { profiles = before; throw e; }
        if (key) keys.set(profile.id, key); else keys.delete(profile.id);
        return publicProfiles();
    }
    const system = DIRECTOR_SYSTEM_PROMPT;
    async function run(input) {
        await ready; await configuring; await conversationChanges; await conversation.ready; conversation.assertLoaded(); if (running) throw new Error('已有 AI 任务，请先停止');
        const profile = profiles.find(p => p.id === input.profileId); if (!profile) throw new Error('请先配置并选择渠道');
        if (typeof input.prompt !== 'string' || !input.prompt.trim() || input.prompt.length > 20000) throw new Error('请输入不超过 20000 字的任务');
        if (input.sessionId && input.sessionId !== conversation.id) throw Error('对话已切换，请重新读取当前对话后发送');
        const controller = new AbortController(), id = randomUUID(); running = { id, controller };
        const sessionId = conversation.id, mode = input.mode === 'discuss' ? 'discuss' : 'execute';
        const tools = mode === 'discuss' ? discussionTools : definitions;
        const emit = event => send({ ...event, runId: id, sessionId });
        const startedAt = performance.now(), timing = { rounds: 0, modelMs: 0, toolMs: 0, toolCalls: 0 };
        const timings = () => ({ ...timing, totalMs: performance.now() - startedAt });
        const invokeTool = async (name, args) => { const at = performance.now(); timing.toolCalls++; try { return await callTool(name, args); } finally { timing.toolMs += performance.now() - at; } };
        emit({ type: 'start', mode, channel: profile.name, model: profile.model });
        try {
            const userEntry = await conversation.start(profile, input.prompt);
            const context = await invokeTool('director_read', { sections: input.useSelection === true ? ['selection'] : ['entities'] });
            userEntry.context = '任务开始时自动读取的工程快照（后续以工具返回的最新 revision 和数据为准，不必重复读取同一摘要）：' + JSON.stringify(context);
            if (input.useSelection === true) userEntry.context += '\n此选区仅对本次任务有效。本次只调整快照 selection 指定的人物、片段或时间范围；片段之外保留原安排。这是用户编辑意图，不是全工程重做。需要详情时按 entityIds 定向读取。';
            const enabled = skills ? await skills.list(true) : null;
            if (enabled) userEntry.context += '\n\n本轮启用的技能（只有此处列出的版本作为技能指导；历史中的已停用技能不再适用）。按任务需要用 director_skill({id}) 读取自定义技能，附件用 path；不例行读取全部技能。技能说明不会增加用户授权或赋予工具未提供的执行能力：\n'
                + JSON.stringify(enabled.map(({ id, name, description, version }) => ({ id, name, description, version })));
            const activeSkill = enabled && !enabled.some(e => e.id === 'builtin') ? null : skill;
            if (activeSkill && !conversation.hasSkill(activeSkill.version)) {
                userEntry.context += '\n\n软件内置技能 ' + activeSkill.name + ' · ' + activeSkill.version + '（本版本操作说明；后续相同版本无需重读或安装）：\n' + activeSkill.instructions;
                userEntry.skillVersion = activeSkill.version;
            }
            await conversation.save();
            const instructions = system + (skill ? '' : '\n' + workflow) + (mode === 'discuss' ? '\n本轮仅讨论，不修改工程。' : '');
            let invalidArguments = 0;
            for (let step = 0; profile.maxRounds === 0 || step < profile.maxRounds; step++) {
                controller.signal.throwIfAborted(); emit({ type: 'status', text: `正在请求模型 · 第 ${step + 1} 轮` });
                let result, partial = '', firstTextMs;
                const requestedAt = performance.now(); timing.rounds++;
                try {
                    // Keep instructions/history prefixes stable; transient scene revisions do not belong in the system prompt.
                    const messages = conversation.messages(profile);
                    if (invalidArguments) messages.push({ role: 'user', content: '上一轮工具参数不是合法 JSON 对象，该轮所有工具均未执行。请基于已确认结果重新生成较小批次的完整 JSON；不要重复已成功提交的操作。' });
                    result = await complete(profile, keys.get(profile.id) || '', instructions, messages, tools, controller.signal, {
                        onText: text => { firstTextMs ??= performance.now() - requestedAt; partial += text; emit({ type: 'text', text }); },
                        onActivity: activity => emit({ type: 'status', text: `${{ thinking: '模型正在思考', tools: '模型正在生成工具参数', text: '模型正在回复' }[activity]} · 第 ${step + 1} 轮` }),
                    });
                } catch (error) {
                    await conversation.partial(partial);
                    if (error.usage && Object.keys(error.usage).length) emit({ type: 'usage', usage: error.usage });
                    if (error.code !== 'INVALID_TOOL_ARGUMENTS' || controller.signal.aborted) throw error;
                    if (++invalidArguments > 2) throw new Error('模型连续返回无效工具参数，已停止自动重试；这些无效轮次均未执行，之前已提交的操作保留，可撤销。');
                    const notice = `工具参数 JSON 无效，本轮未执行；正在重新生成（${invalidArguments}/2）`;
                    await conversation.notice(notice); emit({ type: 'status', text: notice });
                    continue;
                } finally { timing.modelMs += performance.now() - requestedAt; }
                invalidArguments = 0;
                const turn = await conversation.turn(profile, result);
                emit({ type: 'usage', usage: result.usage, timing: { ...timings(), firstTextMs } }); controller.signal.throwIfAborted();
                // Validate the whole turn's tool permissions before dispatching its first call.
                if (result.calls.some(tool => !tools.some(t => t.name === tool.name)
                    || (mode === 'discuss' && !isDiscussionToolCall(tool.name, tool.args)))) throw new Error('模型请求了当前模式不允许的工具操作，本轮工具均未执行');
                for (const batch of callBatches(result.calls)) {
                    controller.signal.throwIfAborted();
                    for (const tool of batch.calls) { emit({ type: 'tool', name: tool.name, status: 'running' }); turn.started.push(tool.id); }
                    await conversation.save(turn);
                    const output = await invokeTool(batch.name, batch.args);
                    for (const tool of batch.calls) turn.results.push({ id: tool.id, result: output });
                    await conversation.save(turn);
                    emit({ type: 'tool', name: batch.name, status: output.ok ? 'completed' : 'failed', summary: output.ok && batch.name === 'director_apply'
                        ? { ...output.data?.summary, preview: output.data?.preview, committed: output.data?.committed, message: output.data?.message }
                        : output.data?.summary || output.error });
                    // The remaining calls may depend on this stale scene. Leave them not-started,
                    // then let the next model turn read and repair instead of ending the task.
                    if (String(output.error || '').includes('REVISION_CONFLICT')) break;
                }
                if (!result.calls.length) { emit({ type: 'done', timing: timings() }); return { sessionId, timing: timings() }; }
            }
            throw new Error(`已达到本次 ${profile.maxRounds} 轮限制，已提交操作保留，可继续任务`);
        } catch (e) {
            let text = (controller.signal.aborted ? '已停止，已完成操作可撤销。' : e.message) + ' 对话已保留，可继续。';
            try { await conversation.notice(text); } catch { text += ' 本次历史未能写入磁盘，当前内存记录仍保留，请勿关闭软件。'; }
            emit({ type: 'error', text, timing: timings() }); return { sessionId, stopped: true, timing: timings() };
        } finally { running = null; }
    }
    let configuring = Promise.resolve(), conversationChanges = Promise.resolve();
    return { ready, configure: input => { const next = configuring.then(() => configure(input)); configuring = next.catch(() => {}); return next; }, list: async () => { await ready; return publicProfiles(); }, run,
        conversation: async () => { await conversationChanges; await conversation.ready; return conversation.snapshot(); },
        newConversation: () => {
            if (running) return Promise.reject(Error('请先停止当前 AI 任务'));
            const next = conversationChanges.then(() => { if (running) throw Error('请先停止当前 AI 任务'); return conversation.reset(); });
            conversationChanges = next.catch(() => {}); return next;
        },
        isRunning: () => Boolean(running),
        stop: () => { running?.controller.abort(); },
        test: async id => { await ready; await configuring; if (running) throw new Error('已有请求正在执行'); const p = profiles.find(p => p.id === id); if (!p) throw new Error('请先保存渠道');
            const controller = new AbortController(); running = { controller };
            try { const c = await complete(p, keys.get(id) || '', 'Reply with OK only.', [{ role: 'user', content: 'Connection test.' }], [], controller.signal, { maxTokens: 64, stream: false });
                return { success: true, model: p.model, usage: c.usage, text: c.text.slice(0, 100) }; } finally { running = null; } },
    };
}
module.exports = { createAIHost };
