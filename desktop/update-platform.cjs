const fs = require('node:fs');
const path = require('node:path');

function updateTarget(platform = process.platform, arch = process.arch) {
    if (platform === 'win32' && arch === 'x64') return { directory: 'win-x64', metadata: 'latest.yml', artifact: version => `DirectorDesk-Setup-${version}.exe` };
    if (platform === 'linux' && arch === 'x64') return { directory: 'linux-x64', metadata: 'latest-linux.yml', artifact: version => `DirectorDesk-${version}-linux-x64.AppImage` };
    return null;
}
function updateMode({ packaged, platform = process.platform, arch = process.arch, appImage = process.env.APPIMAGE, portable = false }) {
    if (!packaged) return 'development';
    if (!updateTarget(platform, arch)) return 'unsupported';
    if (platform === 'linux') return appImage && path.isAbsolute(appImage) ? 'installed' : 'unsupported';
    return portable ? 'portable' : 'installed';
}
// Check before quitting: a downloaded AppImage cannot replace a root-owned installation.
function assertAppImageWritable(file) {
    try {
        if (!file || !path.isAbsolute(file) || !fs.statSync(file).isFile()) throw Error('Invalid AppImage');
        fs.accessSync(file, fs.constants.W_OK);
        fs.accessSync(path.dirname(file), fs.constants.W_OK | fs.constants.X_OK);
    } catch {
        throw Error('无法更新此位置的应用，请将 AppImage 移到可写目录后重试');
    }
}
module.exports = { updateTarget, updateMode, assertAppImageWritable };
