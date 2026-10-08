const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const newToken = () => randomBytes(32).toString('hex');
function createMcpConfig(directory, safeStorage) {
    const file = path.join(directory, 'mcp-connection.json');
    const settingsFile = path.join(directory, 'mcp-settings.json');
    function encryption() {
        if (!safeStorage.isEncryptionAvailable()) throw Error('系统加密暂不可用，无法读取或保存 MCP 凭据');
    }
    return {
        enabled() {
            let raw;
            try { raw = fs.readFileSync(settingsFile, 'utf8'); }
            catch (e) { if (e.code === 'ENOENT') return true; throw Error('无法读取 MCP 开关设置'); }
            try { const data = JSON.parse(raw); if (typeof data.enabled !== 'boolean') throw Error(); return data.enabled; }
            catch { throw Error('MCP 开关设置损坏，请重新设置开关'); }
        },
        setEnabled(enabled) {
            if (typeof enabled !== 'boolean') throw Error('MCP 开关设置无效');
            try {
                fs.mkdirSync(directory, { recursive: true });
                fs.writeFileSync(settingsFile + '.tmp', JSON.stringify({ enabled }), { mode: 0o600 });
                fs.renameSync(settingsFile + '.tmp', settingsFile);
            } catch { throw Error('无法保存 MCP 开关设置'); }
        },
        read() {
            let raw;
            try { raw = fs.readFileSync(file, 'utf8'); }
            catch (e) { if (e.code === 'ENOENT') return null; throw Error('无法读取本机 MCP 配置'); }
            encryption();
            try {
                const data = JSON.parse(raw);
                if (data.version !== 1 || !Number.isInteger(data.port) || data.port < 1 || data.port > 65535 || typeof data.secret !== 'string') throw Error();
                const token = safeStorage.decryptString(Buffer.from(data.secret, 'base64'));
                if (!/^[a-f0-9]{64}$/.test(token)) throw Error();
                return { port: data.port, token };
            } catch { throw Error('本机 MCP 配置损坏或无法解密，未自动更换连接凭据'); }
        },
        save({ port, token }) {
            encryption();
            const data = { version: 1, port, secret: safeStorage.encryptString(token).toString('base64') };
            try {
                fs.mkdirSync(directory, { recursive: true });
                fs.writeFileSync(file + '.tmp', JSON.stringify(data), { mode: 0o600 });
                fs.renameSync(file + '.tmp', file);
            } catch { throw Error('无法保存本机 MCP 配置，连接凭据未更换'); }
        },
    };
}
module.exports = { createMcpConfig, newToken };
