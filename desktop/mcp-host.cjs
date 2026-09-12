const { createMcpConfig, newToken } = require('./mcp-config.cjs');
const { startMcp } = require('./mcp-server.cjs');
const { mcpConnection } = require('./mcp-connection.cjs');
const { startLanProxy } = require('./mcp-lan-proxy.cjs');
function createMcpHost({ directory, safeStorage, definitions, call, version, bridgeRuntime }) {
    const config = createMcpConfig(directory, safeStorage);
    let server = null, lanProxy = null, queue = Promise.resolve(), disposed = false;
    const serial = action => { const next = queue.then(action); queue = next.catch(() => {}); return next; };
    const state = () => ({
        enabled: Boolean(server),
        url: server?.url,
        ...(lanProxy ? {
            lanEnabled: true,
            lanUrl: lanProxy.url,
            lanIp: lanProxy.ip,
            lanPort: lanProxy.port,
        } : {}),
    });
    return {
        change(enabled) { return serial(async () => {
            if (disposed) throw Error('软件已关闭');
            if (enabled === true && !server) {
                const saved = config.read(), token = saved?.token || newToken();
                const next = await startMcp(definitions, call, version, { port: saved?.port ?? 0, token });
                try { if (!saved) config.save({ port: next.port, token }); }
                catch (e) { await next.close(); throw e; }
                server = next;
            }
            if (enabled === false) {
                if (lanProxy) { await lanProxy.close(); lanProxy = null; }
                if (server) { await server.close(); server = null; }
            }
            return state();
        }); },
        lan(enabled) { return serial(async () => {
            if (disposed) throw Error('软件已关闭');
            if (enabled === true) {
                if (!server) throw Error('请先开启本机 MCP 服务');
                if (!lanProxy) lanProxy = await startLanProxy({ targetPort: server.port });
            }
            if (enabled === false && lanProxy) {
                await lanProxy.close();
                lanProxy = null;
            }
            return state();
        }); },
        reset() { return serial(() => {
            if (disposed || !server) throw Error('请先开启 MCP');
            const token = newToken();
            config.save({ port: server.port, token });
            server.setToken(token);
            return state();
        }); },
        connection(client, options) { return serial(() => {
            if (disposed || !server) throw Error('请先开启 MCP');
            return mcpConnection({ url: server.url, lanUrl: lanProxy?.url, token: server.token }, client, bridgeRuntime, options);
        }); },
        close() { disposed = true; return serial(async () => {
            if (lanProxy) { await lanProxy.close(); lanProxy = null; }
            if (server) { await server.close(); server = null; }
        }); },
    };
}
module.exports = { createMcpHost };
