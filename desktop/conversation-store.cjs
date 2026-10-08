const fs = require('node:fs/promises');
const path = require('node:path');

// One atomic file per entry: updating a tool result never rewrites earlier turns.
function conversationStore(directory, safeStorage) {
    const file = path.join(directory, 'ai-conversation.json');
    let savedSession = '', savedCount = 0, savedProfile = '', queue = Promise.resolve();
    const folder = id => {
        if (!/^[a-f0-9-]{36}$/i.test(id)) throw Error('Invalid conversation ID');
        return path.join(directory, 'ai-conversation-' + id);
    };
    const encode = data => {
        const text = JSON.stringify(data);
        return safeStorage.isEncryptionAvailable() ? JSON.stringify({ encrypted: true, data: safeStorage.encryptString(text).toString('base64') }) : text;
    };
    const decode = text => {
        const data = JSON.parse(text);
        return data.encrypted ? JSON.parse(safeStorage.decryptString(Buffer.from(data.data, 'base64'))) : data;
    };
    async function atomic(target, text) {
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target + '.tmp', text, { mode: 0o600 });
        await fs.rename(target + '.tmp', target);
    }
    return {
        async load() {
            const data = decode(await fs.readFile(file, 'utf8'));
            if (data.version !== 2) return data; // Version 1 migrates on the next successful save.
            if (!Number.isSafeInteger(data.count) || data.count < 0 || data.count > 1000000) throw Error('Invalid entry count');
            const root = folder(data.sessionId), entries = [];
            for (let i = 0; i < data.count; i += 32) {
                entries.push(...await Promise.all(Array.from({ length: Math.min(32, data.count - i) }, (_, n) =>
                    fs.readFile(path.join(root, (i + n) + '.json'), 'utf8').then(decode))));
            }
            savedSession = data.sessionId; savedCount = data.count; savedProfile = data.profileId;
            return { version: 1, sessionId: data.sessionId, profileId: data.profileId, entries };
        },
        save(state, entry = state.entries.at(-1)) {
            const index = entry ? state.entries.indexOf(entry) : -1;
            // Capture the changed entry now; filesystem work remains ordered.
            const changed = index < 0 ? null : encode(entry);
            const sessionId = state.sessionId, profileId = state.profileId, count = state.entries.length;
            const migration = sessionId !== savedSession ? state.entries.map(encode) : null;
            const pending = queue.then(async () => {
                const root = folder(sessionId), previous = savedSession;
                if (savedSession !== sessionId) {
                    for (let i = 0; i < count; i++) await atomic(path.join(root, i + '.json'), migration[i]);
                } else if (changed !== null) await atomic(path.join(root, index + '.json'), changed);
                if (savedSession !== sessionId || savedCount !== count || savedProfile !== profileId) {
                    await atomic(file, encode({ version: 2, sessionId, profileId, count }));
                    savedSession = sessionId; savedCount = count; savedProfile = profileId;
                }
                // Only manual New Conversation changes an established session ID.
                if (previous && previous !== sessionId) await fs.rm(folder(previous), { recursive: true, force: true }).catch(() => {});
            });
            queue = pending.catch(() => {});
            return pending;
        },
        async idle() { await queue; },
    };
}
module.exports = { conversationStore };
