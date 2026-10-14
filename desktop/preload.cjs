const { contextBridge, ipcRenderer, webUtils } = require('electron');
const invoke = (action, data) => ipcRenderer.invoke('director-host', { action, data });
contextBridge.exposeInMainWorld('directorDesktop', {
    setLanguage: language => ipcRenderer.send('director-language', language),
    extensions: data => ipcRenderer.invoke('director-extensions', data),
    onExtensionRequest: callback => {const listener=async(_event,request)=>{try{ipcRenderer.send('director-extension-reply',{id:request.id,result:await callback(request)});}catch(error){ipcRenderer.send('director-extension-reply',{id:request.id,error:error.message});}};ipcRenderer.on('director-extension-request',listener);return()=>ipcRenderer.removeListener('director-extension-request',listener);},
    skills: data => invoke('skills', data),
    files: (action, data) => ipcRenderer.invoke('director-files', { action, data }),
    pathForFile: file => webUtils.getPathForFile(file),
    closingState: data => ipcRenderer.sendSync('director-close-state', data),
    onSaveBeforeClose: callback => { const fn = async (_event, data) => {
        let saved = false; try { saved = await callback() === true; } catch { }
        ipcRenderer.send('director-save-close-result', { id: data.id, saved });
    }; ipcRenderer.on('director-save-before-close', fn); return () => ipcRenderer.removeListener('director-save-before-close', fn); },
    update: (action, data) => ipcRenderer.invoke('director-updates', { action, data }),
    onUpdate: callback => { const fn = (_event, data) => callback(data); ipcRenderer.on('director-update-state', fn); return () => ipcRenderer.removeListener('director-update-state', fn); },
    profiles: () => invoke('profiles'), configure: data => invoke('configure', data), test: id => invoke('test', id),
    conversation: () => invoke('conversation'), newConversation: () => invoke('new-conversation'),
    run: data => invoke('run', data), stop: () => invoke('stop'),
    mcp: enabled => invoke('mcp', enabled),
    mcpLan: enabled => invoke('mcp-lan', enabled),
    copyMcp: (client, useLan) => invoke('copy-mcp', typeof client === 'object' ? client : { client, useLan }),
    resetMcp: () => invoke('reset-mcp'),
    copyText: text => invoke('copy-text', text),
    onEvent: callback => { const fn = (_event, data) => callback(data); ipcRenderer.on('director-ai-event', fn); return () => ipcRenderer.removeListener('director-ai-event', fn); },
    onTool: callback => { const fn = async (_event, data) => { let result; try { result = await callback(data.name, data.args); } catch { result = { ok: false, error: '工具执行失败' }; } ipcRenderer.send('director-tool-result', { id: data.id, result }); };
        ipcRenderer.on('director-tool-call', fn); ipcRenderer.send('director-tools-ready'); return () => ipcRenderer.removeListener('director-tool-call', fn); },
});
