const {contextBridge,ipcRenderer}=require('electron');
const channel=process.argv.find(v=>v.startsWith('--lite-channel='))?.slice(15);
contextBridge.exposeInMainWorld('liteTask',{send:value=>ipcRenderer.invoke(channel,value)});
