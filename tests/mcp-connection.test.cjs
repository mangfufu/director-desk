const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { createMcpHost } = require('../desktop/mcp-host.cjs');
// Persistence tests use a reversible stand-in; desktop restart tests cover actual OS encryption.
const safeStorage = { isEncryptionAvailable: () => true, encryptString: s => Buffer.from(s.split('').reverse().join('')), decryptString: b => b.toString().split('').reverse().join('') };
test('MCP configuration survives stop/start and a new host; reset invalidates old credentials without changing the port', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'director-mcp-'));
    const make = () => createMcpHost({ directory, safeStorage, definitions: [], call: async () => ({ ok: true }), version: '1.0.0' });
    let host = make();
    const connection = async () => (await host.connection()).mcpServers['director-desk'];
    const status = c => fetch(c.url, { method: 'POST', headers: { ...c.headers, 'content-type': 'application/json', accept: 'application/json, text/event-stream', connection: 'close' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) }).then(r => r.status);
    try {
        await host.change(true); const first = await connection(); assert.equal(await status(first), 200);
        await host.change(false); await host.change(true); assert.deepEqual(await connection(), first);
        await host.close(); host = make(); await host.change(true); assert.deepEqual(await connection(), first);
        await host.reset(); const reset = await connection(); assert.equal(reset.url, first.url); assert.notDeepEqual(reset.headers, first.headers);
        assert.equal(await status(first), 403); assert.equal(await status(reset), 200);
        await host.close(); host = make(); await host.change(true); assert.deepEqual(await connection(), reset);
        await host.change(false);
        const before = fs.readFileSync(path.join(directory, 'mcp-connection.json'), 'utf8');
        const blocker = http.createServer(); await new Promise(r => blocker.listen(Number(new URL(reset.url).port), '127.0.0.1', r));
        try { await assert.rejects(host.change(true), /已被占用/); assert.equal(fs.readFileSync(path.join(directory, 'mcp-connection.json'), 'utf8'), before); }
        finally { await new Promise(r => blocker.close(r)); }
        await host.change(true); assert.deepEqual(await connection(), reset);
        const temp = path.join(directory, 'mcp-connection.json.tmp');
        fs.mkdirSync(temp);
        try { await assert.rejects(host.reset(), /无法保存/); assert.deepEqual(await connection(), reset); assert.equal(await status(reset), 200); }
        finally { fs.rmdirSync(temp); }
        await host.change(false);
        fs.writeFileSync(path.join(directory, 'mcp-connection.json'), '{broken');
        await assert.rejects(host.change(true), /损坏/);
        assert.equal(fs.readFileSync(path.join(directory, 'mcp-connection.json'), 'utf8'), '{broken');
    } finally { await host.close(); fs.rmSync(directory, { recursive: true, force: true }); }
});
test('MCP does not leave a server running when secure persistence is unavailable', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'director-mcp-'));
    const host = createMcpHost({ directory, safeStorage: { isEncryptionAvailable: () => false }, definitions: [], call: async () => ({}), version: '1.0.0' });
    try { await assert.rejects(host.change(true), /系统加密/); assert.deepEqual(await host.change(), { enabled: false, url: undefined }); assert.deepEqual(fs.readdirSync(directory), []); }
    finally { await host.close(); fs.rmSync(directory, { recursive: true, force: true }); }
});
