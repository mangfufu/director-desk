const { createMcpConfig, newToken } = require('./mcp-config.cjs');
const { startMcp } = require('./mcp-server.cjs');
const { mcpConnection } = require('./mcp-connection.cjs');
const { startLanProxy } = require('./mcp-lan-proxy.cjs');
function createMcpHost({ directory, safeStorage, definitions, call, version, bridgeRuntime, lanProxyPort }) {
    const config = createMcpConfig(directory, safeStorage);
    let server = null, lanProxy = null, queue = Promise.resolve(), disposed = false;
    let initialized = false, startupError = '';
    const serial = action => { const next = queue.then(action); queue = next.catch(() => {}); return next; };
    const state = () => ({
        enabled: Boolean(server),
        url: server?.url,
        ...(startupError ? { error: startupError } : {}),
        ...(lanProxy ? {
            lanEnabled: true,
            lanUrl: lanProxy.url,
            lanIp: lanProxy.ip,
            lanPort: lanProxy.port,
        } : {}),
    });
    async function start() {
        if (server) return;
        const saved = config.read(), token = saved?.token || newToken();
        const next = await startMcp(definitions, call, version, { port: saved?.port ?? 0, token });
        try { if (!saved) config.save({ port: next.port, token }); }
        catch (e) { await next.close(); throw e; }
        server = next;
    }
    return {
        initialize() { return serial(async () => {
            if (disposed || initialized) return state();
            initialized = true;
            try { if (config.enabled()) await start(); }
            catch (error) { startupError = error.message; }
            return state();
        }); },
        change(enabled) { return serial(async () => {
            if (disposed) throw Error('软件已关闭');
            if (enabled === true) {
                const wasRunning = Boolean(server);
                await start();
                try { config.setEnabled(true); }
                catch (error) { if (!wasRunning) { await server.close(); server = null; } throw error; }
                startupError = '';
            }
            if (enabled === false) {
                config.setEnabled(false);
                if (lanProxy) { await lanProxy.close(); lanProxy = null; }
                if (server) { await server.close(); server = null; }
                startupError = '';
            }
            return state();
        }); },
        lan(enabled) { return serial(async () => {
            if (disposed) throw Error('软件已关闭');
            if (enabled === true) {
                if (!server) throw Error('请先开启本机 MCP 服务');
                if (!lanProxy) lanProxy = await startLanProxy({ targetPort: server.port, proxyPort: lanProxyPort });
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
