import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { build } from 'esbuild';
import { publicFiles as publicSkillFiles } from './builtin-skill-files.cjs';
import { releaseVersion, parseReleaseVersion } from '../desktop/release-version.cjs';
import './build-offline-skill.mjs';

const check = spawnSync(process.execPath, ['scripts/check-release-privacy.mjs'], { stdio: 'inherit' });
if (check.status !== 0) process.exit(check.status || 1);
const metadata = JSON.parse(await fs.readFile('package.json', 'utf8'));
const publicVersion = releaseVersion(metadata.version);
if (metadata.shortVersion !== publicVersion) throw Error('Public release version does not match package version');
const manifest = JSON.parse(await fs.readFile('.audit/release-web-manifest.json', 'utf8'));
const desktopRoot = path.resolve('.audit/desktop-app');
// Always start from a clean, verified staging directory; never package the workspace root.
if (path.dirname(desktopRoot) !== path.resolve('.audit') || path.basename(desktopRoot) !== 'desktop-app') throw new Error('Invalid staging directory');
await fs.rm(desktopRoot, { recursive: true, force: true });
await fs.mkdir(path.join(desktopRoot, 'desktop'), { recursive: true });
for (const { file } of manifest.files) {
    const destination = path.join(desktopRoot, 'dist', file); await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(path.join('dist', file), destination);
}
// Rasterize the existing public vector product mark, then wrap its PNG as Windows and macOS icons.
const candidates = process.platform === 'darwin' ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
    : process.platform === 'win32' ? [path.join(process.env.ProgramFiles || 'C:/Program Files', 'Google/Chrome/Application/chrome.exe')]
    : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
const executablePath = process.env.CHROME_PATH || (await Promise.all(candidates.map(async candidate =>
    await fs.access(candidate).then(() => candidate, () => null)))).find(Boolean);
if (!executablePath) throw Error('Chrome/Chromium not found. Install it or set CHROME_PATH to its executable.');
const browser = await chromium.launch({ executablePath, headless: true });
try {
    const page = await browser.newPage();
    const render = async size => {
        await page.setViewportSize({ width: size, height: size });
        await page.setContent(`<style>html,body{margin:0;width:${size}px;height:${size}px;background:transparent}svg{width:${size}px;height:${size}px}</style>` + await fs.readFile('public/favicon.svg', 'utf8'));
        return await page.screenshot({ omitBackground: true });
    };
    const png = await render(256);
    const header = Buffer.alloc(22); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
    header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12); header.writeUInt32LE(png.length, 14); header.writeUInt32LE(22, 18);
    await fs.writeFile('desktop/icon.ico', Buffer.concat([header, png]));
    // ICNS accepts embedded PNG data for every modern size on Apple's icon grid.
    const chunks = [];
    for (const [size, type] of [[16, 'icp4'], [32, 'icp5'], [64, 'icp6'], [128, 'ic07'], [256, 'ic08'], [512, 'ic09'], [1024, 'ic10']]) {
        const data = await render(size), chunk = Buffer.alloc(8);
        chunk.write(type, 0, 'ascii'); chunk.writeUInt32BE(data.length + 8, 4); chunks.push(chunk, data);
    }
    const icons = Buffer.concat(chunks), icnsHeader = Buffer.alloc(8);
    icnsHeader.write('icns', 0, 'ascii'); icnsHeader.writeUInt32BE(icons.length + 8, 4);
    await fs.writeFile('desktop/icon.icns', Buffer.concat([icnsHeader, icons]));
} finally { await browser.close(); }
await fs.copyFile('desktop/main.cjs', path.join(desktopRoot, 'desktop/main.cjs'));
await fs.copyFile('desktop/language.cjs', path.join(desktopRoot, 'desktop/language.cjs'));
await fs.copyFile('desktop/preload.cjs', path.join(desktopRoot, 'desktop/preload.cjs'));
await build({entryPoints:['desktop/extensions.cjs'],outfile:path.join(desktopRoot,'desktop/extensions.cjs'),bundle:true,platform:'node',format:'cjs',external:['electron'],sourcemap:false,minify:true});
await build({entryPoints:['desktop/extensions/worker.cjs'],outfile:path.join(desktopRoot,'desktop/extension-worker.cjs'),bundle:true,platform:'node',format:'cjs',sourcemap:false,minify:true});
await build({ entryPoints: ['src/automation/contract.ts'], outfile: path.join(desktopRoot, 'desktop/tools-contract.cjs'), bundle: true, platform: 'node', format: 'cjs', charset: 'utf8', sourcemap: false, minify: true });
const bundled = await build({ entryPoints: ['desktop/integration.cjs'], outfile: path.join(desktopRoot, 'desktop/integration.cjs'), bundle: true, platform: 'node', format: 'cjs', external: ['electron', './tools-contract.cjs'], sourcemap: false, minify: true, metafile: true });
await build({ entryPoints: ['desktop/files.cjs'], outfile: path.join(desktopRoot, 'desktop/files.cjs'), bundle: true, platform: 'node', format: 'cjs', external: ['electron'], sourcemap: false, minify: true });
const updatesBundle = await build({ entryPoints: ['desktop/updates.cjs'], outfile: path.join(desktopRoot, 'desktop/updates.cjs'), bundle: true, platform: 'node', format: 'cjs', external: ['electron'], sourcemap: false, minify: true, metafile: true });
const bridgeBundle = await build({ entryPoints: ['desktop/mcp-stdio.cjs'], outfile: path.join(desktopRoot, 'desktop/mcp-stdio.cjs'), bundle: true, platform: 'node', format: 'cjs', sourcemap: false, minify: true, metafile: true });
for (const file of publicSkillFiles) {
    const relative = path.join('skills/director-desk', file), destination = path.join(desktopRoot, relative);
    await fs.mkdir(path.dirname(destination), { recursive: true }); await fs.copyFile(relative, destination);
}
await fs.copyFile('desktop/icon.ico', path.join(desktopRoot, 'desktop/icon.ico'));
await fs.copyFile('LICENSE', path.join(desktopRoot, 'LICENSE'));
await fs.writeFile(path.join(desktopRoot, 'package.json'), JSON.stringify({ name: 'director-desk', productName: '导演台', version: metadata.version, shortVersion: publicVersion, shortVersionWindows: parseReleaseVersion(publicVersion).parts.join('.'),
    description: '导演台 · AI 短剧预演', main: 'desktop/main.cjs', author: 'DirectorDesk', license: metadata.license, private: true }, null, 2));
const packages = new Set(['three', 'mediabunny', 'cannon-es']);
for (const input of [...Object.keys(bundled.metafile.inputs), ...Object.keys(updatesBundle.metafile.inputs), ...Object.keys(bridgeBundle.metafile.inputs)]) { const match = input.match(/^node_modules\/(?:@[^/]+\/[^/]+|[^/]+)/); if (match) packages.add(match[0].slice(13)); }
const licenses = await Promise.all([...packages].sort().map(async name => {
    const dir = path.join('node_modules', name), files = await fs.readdir(dir), license = files.find(f => /^licen[sc]e(?:\.[a-z]+)?$/i.test(f));
    if (!license && name === 'lazy-val') return await fs.readFile('desktop/licenses/lazy-val.txt', 'utf8');
    if (!license) throw new Error('Missing bundled dependency license: ' + name);
    return `${name}\n${await fs.readFile(path.join(dir, license), 'utf8')}\n`;
}));
licenses.push(await fs.readFile('src/animation/library/NOTICE.txt', 'utf8'));
await fs.writeFile(path.join(desktopRoot, 'THIRD-PARTY-LICENSES.txt'), licenses.join('\n'));
const stagedCheck = spawnSync(process.execPath, ['scripts/check-release-privacy.mjs', '--desktop'], { stdio: 'inherit' });
if (stagedCheck.status !== 0) process.exit(stagedCheck.status || 1);
console.log('Prepared isolated desktop payload with minimal product metadata and no development dependencies.');
