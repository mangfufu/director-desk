const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createMcpHost } = require('../desktop/mcp-host.cjs');
const { getLanIPv4 } = require('../desktop/mcp-lan-proxy.cjs');

const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: s => Buffer.from(s.split('').reverse().join('')),
    decryptString: b => b.toString().split('').reverse().join('')
};

test('getLanIPv4 returns a valid IPv4 string', () => {
    const ip = getLanIPv4();
    assert.match(ip, /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);
});

test('MCP host LAN toggle, configuration generation, and proxy forwarding', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'director-mcp-lan-'));
    const dummyTools = [{ name: 'dummy_tool', description: 'test dummy', inputSchema: { type: 'object' } }];
    const host = createMcpHost({
        directory,
        safeStorage,
        definitions: dummyTools,
        call: async () => ({ ok: true }),
        version: '1.0.0'
    });

    try {
        // Initially cannot enable LAN if MCP is off
        await assert.rejects(host.lan(true), /请先开启/);

        // Turn on MCP
        const initial = await host.change(true);
        assert.equal(initial.enabled, true);
        assert.equal(Boolean(initial.lanEnabled), false);

        // Turn on LAN proxy
        const lanState = await host.lan(true);
        assert.equal(lanState.enabled, true);
        assert.equal(lanState.lanEnabled, true);
        assert(typeof lanState.lanUrl === 'string');
        assert(lanState.lanUrl.startsWith('http://'));
        assert(lanState.lanUrl.endsWith('/mcp'));
        assert(lanState.lanPort >= 54321);

        // Local connection config
        const localConn = (await host.connection('http', { useLan: false })).mcpServers['director-desk'];
        assert(localConn.url.includes('127.0.0.1'));

        // LAN connection config
        const lanConn = (await host.connection('http', { useLan: true })).mcpServers['director-desk'];
        assert.equal(lanConn.url, lanState.lanUrl);
        assert.deepEqual(lanConn.headers, localConn.headers);

        // Claude Code LAN config
        const claudeCodeLan = (await host.connection('claude-code', { useLan: true })).mcpServers['director-desk'];
        assert.equal(claudeCodeLan.type, 'http');
        assert.equal(claudeCodeLan.url, lanState.lanUrl);

        // Send MCP request through LAN proxy URL
        const res = await fetch(lanState.lanUrl, {
            method: 'POST',
            headers: {
                ...lanConn.headers,
                'content-type': 'application/json',
                accept: 'application/json, text/event-stream',
                connection: 'close'
            },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
        });
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.result?.tools?.[0]?.name, 'dummy_tool');

        // Turn off LAN proxy
        const offState = await host.lan(false);
        assert.equal(offState.enabled, true);
        assert.equal(Boolean(offState.lanEnabled), false);

        // Proxy port should now be closed / unreachable
        await assert.rejects(fetch(lanState.lanUrl, {
            method: 'POST',
            headers: {
                ...lanConn.headers,
                'content-type': 'application/json',
                connection: 'close'
            },
            body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
        }));

        // Turn on LAN proxy again, then turn off MCP completely
        await host.lan(true);
        const stopped = await host.change(false);
        assert.equal(stopped.enabled, false);
        assert.equal(Boolean(stopped.lanEnabled), false);
    } finally {
        await host.close();
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('startLanProxy uses fixed default port and increments by +1 when port is occupied', async () => {
    const http = require('node:http');
    const { startLanProxy, DEFAULT_LAN_PORT } = require('../desktop/mcp-lan-proxy.cjs');

    // Create a target MCP server
    const target = http.createServer((req, res) => res.writeHead(200).end());
    await new Promise(r => target.listen(0, '127.0.0.1', r));
    const targetPort = target.address().port;

    const blocker1 = http.createServer();
    const blocker2 = http.createServer();

    try {
        // Block base port 54321
        await new Promise(r => blocker1.listen(DEFAULT_LAN_PORT, '0.0.0.0', r));
        // Block 54322
        await new Promise(r => blocker2.listen(DEFAULT_LAN_PORT + 1, '0.0.0.0', r));

        // Proxy should skip 54321 and 54322, binding to 54323
        const proxy = await startLanProxy({ targetPort, proxyPort: DEFAULT_LAN_PORT });
        assert.equal(proxy.port, DEFAULT_LAN_PORT + 2);
        assert.equal(proxy.url.includes(String(DEFAULT_LAN_PORT + 2)), true);
        await proxy.close();
    } finally {
        await new Promise(r => blocker1.close(r));
        await new Promise(r => blocker2.close(r));
        await new Promise(r => target.close(r));
    }
});
