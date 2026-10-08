const path = require('node:path');
const { publicFiles: publicSkillFiles } = require('../scripts/builtin-skill-files.cjs');
const { releaseVersion, parseReleaseVersion } = require('./release-version.cjs');
const metadata = require('../package.json');
const version = releaseVersion(metadata.version);
if (metadata.shortVersion !== version) throw Error('Public release version does not match package version');
module.exports = {
    appId: 'app.directordesk.desktop', productName: '导演台', copyright: 'Copyright © 2026 DirectorDesk',
    directories: { app: '.audit/desktop-app', output: 'release', buildResources: 'desktop' },
    files: ['package.json', 'LICENSE', 'desktop/main.cjs', 'desktop/extensions.cjs', 'desktop/extension-worker.cjs', 'desktop/files.cjs', 'desktop/preload.cjs', 'desktop/integration.cjs', 'desktop/updates.cjs', 'desktop/tools-contract.cjs', 'desktop/icon.ico', ...publicSkillFiles.map(file => 'skills/director-desk/' + file), 'dist/index.html', 'dist/favicon.svg', 'dist/assets/*.js', 'dist/assets/*.css', 'THIRD-PARTY-LICENSES.txt', '!node_modules{,/**/*}'],
    // Shareable skill beside the executable, copied only from the audited staging payload.
    extraFiles: [{ from: '.audit/desktop-app/skills/director-desk', to: 'skills/director-desk',
        filter: publicSkillFiles },
        { from: '.audit/desktop-app/LICENSE', to: 'LICENSE' }],
    onNodeModuleFile: () => false,
    extraResources: [{ from: '.audit/desktop-app/desktop/mcp-stdio.cjs', to: 'mcp/stdio-bridge.cjs' }],
    asar: true, npmRebuild: false, publish: { provider: 'generic', url: 'https://bigthat.me/updates/win-x64/' },
    buildVersion: version, buildNumber: String(parseReleaseVersion(version).parts[3]),
    // electron-builder normalizes package.json with semver.clean(), which drops
    // build metadata. Reapply the transport version after that normalization.
    extraMetadata: { version: metadata.version },
    electronVersion: require('electron/package.json').version,
    electronDist: 'node_modules/electron/dist',
    win: { target: [{ target: 'nsis', arch: ['x64'] }], executableName: 'DirectorDesk', icon: path.join(__dirname, 'icon.ico'), signExecutable: false },
    nsis: { oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true,
        createDesktopShortcut: true, createStartMenuShortcut: true, shortcutName: '导演台',
        runAfterFinish: false, deleteAppDataOnUninstall: false, differentialPackage: false,
        artifactName: `DirectorDesk-Setup-${version}.\${ext}`, uninstallDisplayName: `导演台 ${version}`, installerLanguages: ['zh_CN', 'en_US'] },
    // Unsigned build: skip keychain probing so packaging works without a Developer ID certificate.
    mac: { target: [{ target: 'dmg', arch: ['arm64'] }], icon: path.join(__dirname, 'icon.icns'), identity: null,
        category: 'public.app-category.video', artifactName: `DirectorDesk-${version}-\${arch}.\${ext}` },
    dmg: { title: `导演台 ${version}`, writeUpdateInfo: false },
};
