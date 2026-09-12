const http = require('node:http');
const { timingSafeEqual } = require('node:crypto');
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
async function startMcp(definitions, call, version, { port, token }) {
    let expected = Buffer.from('Bearer ' + token);
    const connections = new Set();
    const server = http.createServer(async (req, res) => {
        const host = `127.0.0.1:${server.address().port}`;
        const auth = Buffer.from(req.headers.authorization || '');
        if (req.headers.host !== host || req.headers.origin && req.headers.origin !== 'http://' + host || auth.length !== expected.length || !timingSafeEqual(auth, expected)) { res.writeHead(403).end(); return; }
        if (req.url !== '/mcp') { res.writeHead(404).end(); return; }
        if (req.method !== 'POST') { res.writeHead(405, { Allow: 'POST' }).end(); return; }
        let mcp, transport;
        try {
            req.setEncoding('utf8');
            let buffer = ''; for await (const part of req) { buffer += part; if (Buffer.byteLength(buffer) > 2_000_000) { res.writeHead(413).end(); return; } }
            const body = JSON.parse(buffer);
            mcp = new Server({ name: 'director-desk', version }, { capabilities: { tools: {} } });
            mcp.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: definitions }));
            mcp.setRequestHandler(CallToolRequestSchema, async request => {
                const result = await call(request.params.name, request.params.arguments || {});
                return { content: [{ type: 'text', text: JSON.stringify(result) }], isError: result.ok === false };
            });
            transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
            connections.add(mcp); res.on('close', () => { connections.delete(mcp); void transport.close(); void mcp.close(); });
            await mcp.connect(transport); await transport.handleRequest(req, res, body);
        } catch { if (!res.headersSent) res.writeHead(400).end('Invalid request'); else res.end(); }
    });
    await new Promise((resolve, reject) => {
        server.once('error', e => {
            try { server.close(); } catch {}
            reject(Error(e.code === 'EADDRINUSE' ? `MCP 端口 ${port} 已被占用，请关闭占用程序或其他导演台实例后重试；原连接配置保持不变` : '无法启动本机 MCP 服务'));
        });
        server.listen(port, '127.0.0.1', resolve);
    });
    return { url: `http://127.0.0.1:${server.address().port}/mcp`, port: server.address().port, get token() { return token; },
        setToken(value) { token = value; expected = Buffer.from('Bearer ' + token); },
        close: async () => { await Promise.allSettled([...connections].map(c => c.close())); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}
module.exports = { startMcp };
