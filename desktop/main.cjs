const { app, BrowserWindow, Menu, protocol, dialog } = require('electron');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const { attachIntegration } = require('./integration.cjs');
const { attachUpdates } = require('./updates.cjs');
const { attachFiles } = require('./files.cjs');

const origin = 'director://app';
protocol.registerSchemesAsPrivileged([{ scheme: 'director', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
// Tests use an independent, empty profile. Packaged applications ignore this switch.
if (!app.isPackaged && app.commandLine.hasSwitch('director-test-profile'))
    app.setPath('userData', path.resolve(app.commandLine.getSwitchValue('director-test-profile')));
app.setName('DirectorDesk');
let window;
const csp = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' data: blob:; media-src 'self' data: blob:; worker-src 'self' blob:; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

async function createWindow() {
    const windowTitle = app.isPackaged ? '导演台' : '导演台 · 开发测试版';
    window = new BrowserWindow({ width: 1600, height: 1000, minWidth: 1000, minHeight: 720, show: false,
        title: windowTitle, backgroundColor: '#101214', icon: path.join(__dirname, 'icon.ico'),
        webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, spellcheck: false } });
    window.on('page-title-updated', (event, title) => {
        event.preventDefault();
        const name = title || '导演台';
        window.setTitle(!app.isPackaged && !name.endsWith(' · 开发测试版') ? name + ' · 开发测试版' : name);
    });
    const integration = attachIntegration(window), updates = attachUpdates(window, integration);
    const files = attachFiles(window);
    Menu.setApplicationMenu(null);
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event, url) => { if (url !== origin + '/') event.preventDefault(); });
    window.webContents.on('will-attach-webview', event => event.preventDefault());
    window.webContents.on('will-prevent-unload', event => {
        if (updates.isQuitting()) { event.preventDefault(); return; }
        files.preventUnload(event);
    });
    window.once('ready-to-show', () => window.show());
    window.on('closed', () => { window = null; });
    try { await files.ready; } catch { dialog.showErrorBox('文件位置不可用', '请检查默认目录或本机文件位置配置。'); }
    void window.loadURL(origin + '/');
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
    app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } });
    app.whenReady().then(() => {
        app.setAppUserModelId('app.directordesk.desktop');
        const webRoot = fsSync.existsSync(path.join(app.getAppPath(), 'dist'))
            ? path.join(app.getAppPath(), 'dist')
            : path.resolve(__dirname, '../dist');
        protocol.handle('director', async request => {
            try {
                const url = new URL(request.url), relative = decodeURIComponent(url.pathname).replace(/^\//, '') || 'index.html';
                if (url.hostname !== 'app' || request.method !== 'GET' || !/^(?:index\.html|favicon\.svg|assets\/[A-Za-z0-9_-]+\.(?:js|css)|assets\/three\.core-[A-Za-z0-9_-]+\.js)$/.test(relative))
                    return new Response('Not found', { status: 404 });
                const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[path.extname(relative)];
                return new Response(await fs.readFile(path.join(webRoot, relative)), { headers: {
                    'Content-Type': mime + '; charset=utf-8', 'Content-Security-Policy': csp, 'X-Content-Type-Options': 'nosniff' } });
            } catch { return new Response('Not found', { status: 404 }); }
        });
        createWindow();
    });
    app.on('window-all-closed', () => app.quit());
}
