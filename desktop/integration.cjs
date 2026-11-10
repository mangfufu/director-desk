const { prepareMediaImport } = require('./media-import.cjs');
const { ipcMain, app, safeStorage, clipboard, dialog, net, shell } = require('electron');
const { createReconstructionHost } = require('./video-reconstruction/host.cjs');
const { createVideoSource } = require('./video-reconstruction/video-source.cjs');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createAIHost } = require('./ai-host.cjs');
const { createMcpHost } = require('./mcp-host.cjs');
const { releaseVersion } = require('./release-version.cjs');
const { createAppMetrics } = require('./app-metrics.cjs');
const { createSkillStore } = require('./skills/store.cjs');
const { createSkillHost } = require('./skills/host.cjs');
const { createOfficialSkill } = require('./skills/official.cjs');
const { TOOL_DEFINITIONS, MCP_TOOL_DEFINITIONS, DISCUSSION_TOOLS, isDiscussionToolCall, BUILTIN_SKILL } = require('./tools-contract.cjs');
function attachIntegration(window) {
    const videoSource=createVideoSource();
    let reconstruction, reconstructionRuntime;
    const getReconstruction = () => reconstruction ??= createReconstructionHost({
        directory: path.join(app.getPath('userData'), 'video-reconstruction'),
        assetsDirectory: app.isPackaged ? path.join(process.resourcesPath, 'video-reconstruction') : path.join(app.getAppPath(), 'desktop/video-reconstruction'),
        buildProject: async (directory,options) => (await import(pathToFileURL(path.join(app.isPackaged ? path.join(process.resourcesPath, 'video-reconstruction') : path.join(app.getAppPath(), 'desktop/video-reconstruction'), 'build-project.mjs')).href)).buildProject(directory,options),
        fetch: (url, options) => net.fetch(url, options),
    }).then(runtime => reconstructionRuntime = runtime);
    const appMetrics = createAppMetrics(() => app.getAppMetrics());
    const pending = new Map(); let ready = false;
    const windowState = () => ({ maximized: window.isMaximized(), fullscreen: window.isFullScreen() });
    const windowEvents = ['maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen'];
    const notifyWindowState = () => { if (!window.isDestroyed()) window.webContents.send('director-window-state', windowState()); };
    windowEvents.forEach(name => window.on(name, notifyWindowState));
    const officialSkill = createOfficialSkill({ directory: app.getPath('userData'), builtin: BUILTIN_SKILL,
        onChange: data => { if (!window.isDestroyed()) window.webContents.send('director-skill-changed', data); } });
    const skills = createSkillStore({ directory: app.getPath('userData'), builtin: BUILTIN_SKILL, getBuiltin: officialSkill.current });
    void skills.ready.catch(() => {});
    const trusted = event => event.sender === window.webContents && event.senderFrame?.url === 'director://app/';
    const callTool = async (name, args) => {
        if(name==='director_media'&&args?.action==='import'){try{args=await prepareMediaImport(args);}catch(error){return {ok:false,error:error.message};}}
        return name === 'director_skill'
        ? skills.tool(args).then(data => ({ ok: true, data }), error => ({ ok: false, error: error.message }))
        : new Promise(resolve => {
        if (!ready || window.isDestroyed()) return resolve({ ok: false, error: '导演台尚未连接或正在重新载入' });
        const id = randomUUID(), timer = setTimeout(() => { pending.delete(id); resolve({ ok: false, execution: 'unknown', error: '工具响应超时，请先查询状态，不要直接重复写入' }); }, 60000);
        pending.set(id, { resolve, timer }); window.webContents.send('director-tool-call', { id, name, args });
    });
    };
    const mcp = createMcpHost({ directory: app.getPath('userData'), safeStorage, definitions: MCP_TOOL_DEFINITIONS, call: callTool, version: releaseVersion(app.getVersion()),
        bridgeRuntime: { command: process.execPath, bridgePath: app.isPackaged ? path.join(process.resourcesPath, 'mcp', 'stdio-bridge.cjs') : path.join(app.getAppPath(), 'desktop', 'mcp-stdio.cjs') } });
    void mcp.initialize();
    const host = createAIHost({ directory: app.getPath('userData'), safeStorage, definitions: TOOL_DEFINITIONS, discussionTools: DISCUSSION_TOOLS, isDiscussionToolCall, callTool,
        skill: BUILTIN_SKILL, skills,
        send: data => { if (!window.isDestroyed()) window.webContents.send('director-ai-event', data); } });
    const skillHost = createSkillHost({ store: skills, window, isRunning: () => host.isRunning(), official: officialSkill });
    const resultHandler = (event, data) => { if (!trusted(event) || !data || !pending.has(data.id)) return; const item = pending.get(data.id); clearTimeout(item.timer); pending.delete(data.id); item.resolve(data.result); };
    const readyHandler = event => { if (trusted(event)) ready = true; };
    ipcMain.on('director-tool-result', resultHandler); ipcMain.on('director-tools-ready', readyHandler);
    ipcMain.handle('director-host', async (event, input) => {
        if (!trusted(event)) throw new Error('拒绝未知页面');
        try {
            const { action, data } = input || {}; let result;
            if (action === 'window-control') {
                if (!['state', 'minimize', 'maximize', 'close'].includes(data)) throw new Error('未知窗口操作');
                if (data === 'minimize') window.minimize();
                if (data === 'maximize') {
                    if (window.isFullScreen()) window.setFullScreen(false);
                    else if (window.isMaximized()) window.unmaximize();
                    else window.maximize();
                }
                result = windowState();
                // Use the existing close/save flow, never destroy the window directly.
                if (data === 'close') setImmediate(() => { if (!window.isDestroyed()) window.close(); });
            }
            else if (action === 'reconstruction') {
                const runtime = await getReconstruction();
                if (data?.action === 'choose-video' || data?.action === 'choose-directory') {
                    const directory = data.action === 'choose-directory';
                    const chosen = await dialog.showOpenDialog(window, directory ? {title:'模型目录',properties:['openDirectory','createDirectory']} : {title:'选择视频',properties:['openFile'],filters:[{name:'视频',extensions:['mp4','mov','mkv','avi','webm','m4v']}]});
                    result = {path:chosen.canceled ? undefined : chosen.filePaths[0]};
                } else if (data?.action === 'source-video') {
                    result=await videoSource.select(data.data?.path);
                } else if (data?.action === 'release-video') {
                    videoSource.clear();result=true;
                } else if (data?.action === 'license-page') {
                    await shell.openExternal(runtime.state().model.licenseUrl);result=true;
                } else if (data?.action === 'project-page') {
                    await shell.openExternal(runtime.state().model.sourceUrl);result=true;
                } else result = await runtime.handle(data?.action, data?.data, true);
            }
            else if (action === 'app-metrics') result = appMetrics();
            else if (action === 'profiles') result = await host.list();
            else if (action === 'conversation') result = await host.conversation();
            else if (action === 'new-conversation') result = await host.newConversation();
            else if (action === 'configure') result = await host.configure(data);
            else if (action === 'run') { if (skillHost.isBusy()) throw Error('请等技能导入完成后再发送任务'); result = await host.run(data); }
            else if (action === 'skills') result = await skillHost.handle(data);
            else if (action === 'builtin-skill') result = await officialSkill.current();
            else if (action === 'stop') { host.stop(); result = true; }
            else if (action === 'test') result = await host.test(data);
            else if (action === 'mcp') {
                result = await mcp.change(data);
            } else if (action === 'mcp-lan') {
                result = await mcp.lan(data);
            } else if (action === 'reset-mcp') {
                result = await mcp.reset();
            } else if (action === 'copy-mcp') {
                const client = typeof data === 'string' ? data : data?.client;
                const useLan = typeof data === 'object' ? Boolean(data?.useLan) : false;
                clipboard.writeText(JSON.stringify(await mcp.connection(client, { useLan }), null, 2)); result = true;
            } else if (action === 'copy-text') {
                if (typeof data !== 'string' || data.length > 100000) throw new Error('复制内容无效或超过 100000 字');
                clipboard.writeText(data); result = true;
            } else if (action === 'edit-text') {
                if (!['cut', 'copy', 'paste', 'selectAll'].includes(data)) throw new Error('未知文本操作');
                window.webContents[data](); result = true;
            } else throw new Error('未知桌面操作');
            return { ok: true, data: result };
        } catch (e) { return { ok: false, error: e.message }; }
    });
    window.webContents.on('did-start-navigation', details => { if (!details.isMainFrame || details.isSameDocument) return; ready = false; host.stop(); for (const task of pending.values()) { clearTimeout(task.timer); task.resolve({ ok: false, execution: 'unknown', error: '页面重新载入，调用结果未确认；请重新读取工程，不要直接重复写入' }); } pending.clear(); });
    window.on('closed', () => { host.stop(); void reconstruction?.then(runtime=>runtime.dispose()).catch(()=>{}); void mcp.close(); for (const task of pending.values()) { clearTimeout(task.timer); task.resolve({ ok: false, execution: 'unknown', error: '软件已关闭，调用结果未确认；请重新读取工程，不要直接重复写入' }); }
        windowEvents.forEach(name => window.removeListener(name, notifyWindowState));
        ipcMain.removeHandler('director-host'); ipcMain.removeListener('director-tool-result', resultHandler); ipcMain.removeListener('director-tools-ready', readyHandler); });
    return { videoResponse:request=>videoSource.respond(request), isBusy: () => host.isRunning() || skillHost.isBusy() || pending.size > 0 || !!reconstructionRuntime?.isBusy() };
}
module.exports = { attachIntegration };
