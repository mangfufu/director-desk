const http = require('node:http');
const os = require('node:os');

function getLanIPv4() {
    const interfaces = os.networkInterfaces();
    const candidates = [];
    for (const [name, addrs] of Object.entries(interfaces)) {
        if (!addrs) continue;
        for (const addr of addrs) {
            if (addr.family === 'IPv4' && !addr.internal) {
                // Prioritize standard private IP ranges
                const ip = addr.address;
                const isPrivate = /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
                // Lower priority for virtual/loopback adapters
                const isVirtual = /vEthernet|Virtual|WSL|VMware|VirtualBox|Tailscale|ZeroTier/i.test(name);
                candidates.push({ ip, isPrivate, isVirtual });
            }
        }
    }
    candidates.sort((a, b) => {
        if (a.isPrivate !== b.isPrivate) return a.isPrivate ? -1 : 1;
        if (a.isVirtual !== b.isVirtual) return a.isVirtual ? 1 : -1;
        return 0;
    });
    return candidates[0]?.ip || '127.0.0.1';
}

const DEFAULT_LAN_PORT = 54321;

async function startLanProxy({ targetPort, proxyPort = DEFAULT_LAN_PORT }) {
    let closed = false;
    const connections = new Set();
    const server = http.createServer((req, res) => {
        if (req.url !== '/mcp') {
            res.writeHead(404).end();
            return;
        }
        if (req.method !== 'POST') {
            res.writeHead(405, { Allow: 'POST' }).end();
            return;
        }

        const targetHost = `127.0.0.1:${targetPort}`;
        const headers = { ...req.headers, host: targetHost };
        delete headers.origin;

        const proxyReq = http.request({
            hostname: '127.0.0.1',
            port: targetPort,
            path: req.url,
            method: req.method,
            headers,
        }, proxyRes => {
            res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
            proxyRes.pipe(res);
        });

        proxyReq.on('error', () => {
            if (!res.headersSent) {
                res.writeHead(502).end('导演台服务连接失败');
            } else {
                res.end();
            }
        });

        req.pipe(proxyReq);
    });

    server.on('connection', socket => {
        connections.add(socket);
        socket.on('close', () => connections.delete(socket));
    });

    const basePort = proxyPort > 0 ? proxyPort : DEFAULT_LAN_PORT;
    const maxAttempts = 100;
    let bound = false;
    let lastError = null;

    for (let offset = 0; offset < maxAttempts; offset++) {
        const port = basePort + offset;
        if (port > 65535) break;
        if (port === targetPort) continue;

        try {
            await new Promise((resolve, reject) => {
                const onError = err => {
                    server.off('listening', onListening);
                    reject(err);
                };
                const onListening = () => {
                    server.off('error', onError);
                    resolve();
                };
                server.once('error', onError);
                server.once('listening', onListening);
                server.listen(port, '0.0.0.0');
            });
            bound = true;
            break;
        } catch (err) {
            lastError = err;
            if (err.code !== 'EADDRINUSE') {
                throw Error(`无法启动局域网代理服务: ${err.message}`);
            }
        }
    }

    if (!bound) {
        throw Error(lastError?.code === 'EADDRINUSE'
            ? `局域网代理端口（${basePort} 至 ${basePort + maxAttempts - 1}）均已被占用`
            : '无法启动局域网代理服务');
    }

    const actualPort = server.address().port;
    const ip = getLanIPv4();
    const lanUrl = `http://${ip}:${actualPort}/mcp`;

    return {
        port: actualPort,
        ip,
        url: lanUrl,
        close: async () => {
            if (closed) return;
            closed = true;
            for (const socket of connections) {
                socket.destroy();
            }
            connections.clear();
            await new Promise(resolve => server.close(resolve));
        }
    };
}

module.exports = { getLanIPv4, startLanProxy, DEFAULT_LAN_PORT };
