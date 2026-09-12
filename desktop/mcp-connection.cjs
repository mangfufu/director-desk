const CLIENTS = new Set(['http', 'claude-code', 'claude-desktop', 'stdio']);
function mcpConnection({ url, lanUrl, token }, client = 'http', runtime, options = {}) {
    if (!CLIENTS.has(client)) throw Error('未知 MCP 客户端类型');
    const targetUrl = (options?.useLan && lanUrl) ? lanUrl : url;
    let entry;
    if (client === 'stdio' || client === 'claude-desktop') {
        if (!runtime?.command || !runtime?.bridgePath) throw Error('本地桥接程序尚未就绪');
        entry = { command: runtime.command, args: [runtime.bridgePath], env: {
            ELECTRON_RUN_AS_NODE: '1', DIRECTOR_MCP_URL: targetUrl, DIRECTOR_MCP_TOKEN: token,
        } };
    } else {
        entry = { ...(client === 'claude-code' ? { type: 'http' } : {}), url: targetUrl, headers: { Authorization: 'Bearer ' + token } };
    }
    return { mcpServers: { 'director-desk': entry } };
}
module.exports = { mcpConnection };
