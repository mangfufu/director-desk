const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { startMcp } = require('../desktop/mcp-server.cjs');
const { mcpConnection } = require('../desktop/mcp-connection.cjs');
const { connectionFromEnv } = require('../desktop/mcp-stdio.cjs');

test('client configurations retain generic HTTP and add Claude HTTP or portable stdio without shell commands', () => {
    const connection = { url: 'http://127.0.0.1:23456/mcp', token: randomBytes(32).toString('hex') };
    const runtime = { command: path.resolve('sample app/runtime.exe'), bridgePath: path.resolve('sample app/stdio-bridge.cjs') };
    const entry = kind => mcpConnection(connection, kind, runtime).mcpServers['director-desk'];
    assert.deepEqual(entry('http'), { url: connection.url, headers: { Authorization: 'Bearer ' + connection.token } });
    assert.deepEqual(entry('claude-code'), { type: 'http', ...entry('http') });
    assert.deepEqual(entry('claude-desktop'), entry('stdio'));
    const stdio = entry('stdio'); assert.equal(stdio.command, runtime.command); assert.deepEqual(stdio.args, [runtime.bridgePath]);
    assert.equal(stdio.env.ELECTRON_RUN_AS_NODE, '1'); assert.equal(stdio.env.DIRECTOR_MCP_TOKEN, connection.token);
    assert(!JSON.stringify(stdio.args).includes(connection.token));
    assert.throws(() => entry('unknown'), /未知/); assert.throws(() => mcpConnection(connection, 'stdio'), /尚未就绪/);
});

test('stdio bridge only accepts the local MCP endpoint and never includes rejected credentials in errors', () => {
    const token = randomBytes(32).toString('hex');
    for (const url of ['https://example.com/mcp', 'http://127.0.0.1:23456/other', 'http://127.0.0.1:23456/mcp?x=1', 'http://user:password@127.0.0.1:23456/mcp']) {
        assert.throws(() => connectionFromEnv({ DIRECTOR_MCP_URL: url, DIRECTOR_MCP_TOKEN: token }), error => !error.message.includes(token) && !error.message.includes('password'));
    }
    assert.equal(connectionFromEnv({ DIRECTOR_MCP_URL: 'http://127.0.0.1:23456/mcp', DIRECTOR_MCP_TOKEN: token }).token, token);
});

test('LAN configuration rejects unsupported bridges and disabled LAN without breaking local clients', () => {
    const connection = { url: 'http://127.0.0.1:23456/mcp', lanUrl: 'http://192.168.1.12:54321/mcp', token: randomBytes(32).toString('hex') };
    const runtime = { command: process.execPath, bridgePath: path.resolve('desktop/mcp-stdio.cjs') };
    for (const client of ['claude-desktop', 'stdio']) {
        assert.throws(() => mcpConnection(connection, client, runtime, { useLan: true }), /仅支持本机桥接/);
        const local = mcpConnection(connection, client, runtime).mcpServers['director-desk'];
        assert.equal(connectionFromEnv(local.env).url.href, connection.url);
    }
    for (const client of ['http', 'claude-code']) {
        assert.equal(mcpConnection(connection, client, runtime, { useLan: true }).mcpServers['director-desk'].url, connection.lanUrl);
        assert.throws(() => mcpConnection({ ...connection, lanUrl: undefined }, client, runtime, { useLan: true }), /开启局域网/);
    }
});

test('real stdio to HTTP transport preserves tools, arguments, results and domain errors; failed writes are never replayed', { timeout: 25000 }, async () => {
    const token = randomBytes(32).toString('hex'), calls = [];
    const definitions = ['director_read', 'director_apply', 'director_skill'].map(name => ({ name, description: name, inputSchema: { type: 'object', additionalProperties: true } }));
    const server = await startMcp(definitions, async (name, args) => { calls.push({ name, args }); return args.fail ? { ok: false, error: '参数错误' } : { ok: true, data: { name, args, revision: 7 } }; }, '0.4.4', { port: 0, token });
    const transport = new StdioClientTransport({ command: process.execPath, args: [path.resolve('desktop/mcp-stdio.cjs')], env: { DIRECTOR_MCP_URL: server.url, DIRECTOR_MCP_TOKEN: token }, stderr: 'pipe' });
    let stderr = ''; transport.stderr.on('data', data => { stderr += data; });
    const client = new Client({ name: 'transport-test', version: '1.0.0' });
    try {
        await client.connect(transport, { timeout: 10000 });
        assert.deepEqual(client.getServerVersion(), { name: 'director-desk', version: '0.4.4' });
        assert.match(client.getInstructions(), /director_skill/);
        assert.deepEqual((await client.listTools()).tools, definitions);
        const args = { revision: 6, requestId: 'one-write', operations: [{ op: 'add', name: '人物 A' }] };
        const result = await client.callTool({ name: 'director_apply', arguments: args });
        assert.deepEqual(JSON.parse(result.content[0].text), { ok: true, data: { name: 'director_apply', args, revision: 7 } });
        assert.equal(result.isError, false); assert.equal(calls.length, 1);
        assert.equal((await client.callTool({ name: 'director_apply', arguments: { fail: true } })).isError, true);
        server.setToken(randomBytes(32).toString('hex'));
        await assert.rejects(client.callTool({ name: 'director_apply', arguments: args }), /结果可能尚未确认/);
        assert.equal(calls.length, 2); assert(!stderr.includes(token));
    } finally { await client.close(); await server.close(); }
    assert.equal(stderr, '');
});
