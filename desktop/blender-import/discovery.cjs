const fs = require('node:fs/promises');
const path = require('node:path');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const exec = promisify(execFile);

async function blenderVersion(executable) {
    if (typeof executable !== 'string' || !path.isAbsolute(executable)) throw Error('请选择 Blender 可执行文件');
    const {stdout} = await exec(executable, ['--background', '--factory-startup', '--disable-autoexec', '--version'], {windowsHide:true, timeout:15000, maxBuffer:65536});
    const version = /^Blender (\d+)\.(\d+)\.(\d+)/m.exec(stdout);
    if (!version) throw Error('所选程序不是 Blender');
    if (+version[1] < 4 || +version[1] === 4 && +version[2] < 2) throw Error('需要 Blender 4.2 或更新版本');
    return version[0];
}

async function candidates(env=process.env, platform=process.platform) {
    const names = [], add = name => {if(name && !names.includes(name))names.push(name);};
    for (const dir of (env.PATH || '').split(path.delimiter)) if(dir) add(path.join(dir, platform==='win32'?'blender.exe':'blender'));
    if(platform==='win32') {
        for(const root of [env.ProgramFiles,env['ProgramFiles(x86)'],env.LOCALAPPDATA].filter(Boolean)) {
            const folder=path.join(root,'Blender Foundation');
            for(const dir of (await fs.readdir(folder,{withFileTypes:true}).catch(()=>[])).filter(d=>d.isDirectory()).sort((a,b)=>b.name.localeCompare(a.name,undefined,{numeric:true}))) add(path.join(folder,dir.name,'blender.exe'));
        }
        const steamRoots=[env['ProgramFiles(x86)']&&path.join(env['ProgramFiles(x86)'],'Steam')];
        for(const key of ['HKCU\\Software\\Valve\\Steam','HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\blender.exe']) {
            const {stdout=''}=await exec('reg.exe',['query',key],{windowsHide:true,timeout:3000,maxBuffer:65536}).catch(()=>({}));
            for(const line of stdout.split('\n')) { const match=line.match(/\sREG_SZ\s+(.+)$/);if(!match)continue;const value=match[1].trim();if(/blender\.exe$/i.test(value))add(value);if(/SteamPath\s/i.test(line))steamRoots.push(value); }
        }
        for(const root of steamRoots.filter(Boolean)) {
            add(path.join(root,'steamapps/common/Blender/blender.exe'));
            const text=await fs.readFile(path.join(root,'steamapps/libraryfolders.vdf'),'utf8').catch(()=>'');
            for(const match of text.matchAll(/"path"\s+"([^"]+)"/g)) add(path.join(match[1].replace(/\\\\/g,'\\'),'steamapps/common/Blender/blender.exe'));
        }
    } else if(platform==='darwin') add('/Applications/Blender.app/Contents/MacOS/Blender');
    else for(const dir of ['/usr/bin','/usr/local/bin','/snap/bin','/opt/blender'])add(path.join(dir,'blender'));
    return names;
}
async function discover(saved) {
    for(const file of [...(saved?[saved]:[]),...await candidates()]) {
        if(!await fs.stat(file).then(s=>s.isFile(),()=>false))continue;
        try{return {path:file,version:await blenderVersion(file)};}catch{}
    }
    return {path:'',version:''};
}
module.exports={blenderVersion,discover,candidates};
