import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { _electron as electron } from 'playwright-core';

assert.equal(process.platform, 'linux', 'Run this check on Linux or WSL 2.');
const output = path.resolve('output/linux-package');
await fs.mkdir(output, { recursive: true });
const config = await fs.mkdtemp(path.join(output, 'config-'));
const env = { ...process.env, XDG_CONFIG_HOME: config };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ executablePath: path.resolve('release/linux-unpacked/DirectorDesk'), args: [], env });
try {
    const page = await app.firstWindow(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.locator('#timeline-content .track-lane').first().waitFor();
    const runtime = await app.evaluate(({ app, safeStorage }) => ({
        packaged: app.isPackaged, platform: process.platform, userData: app.getPath('userData'),
        encrypted: safeStorage.isEncryptionAvailable(), backend: safeStorage.getSelectedStorageBackend(), gpu: app.getGPUFeatureStatus(),
    }));
    assert.equal(runtime.packaged, true);
    assert.equal(runtime.platform, 'linux');
    assert.ok(runtime.userData.startsWith(config + path.sep), 'Packaged test uses an isolated profile');
    assert.equal(runtime.encrypted, true);
    assert.notEqual(runtime.backend, 'basic_text', 'Use a real desktop keyring');
    assert.equal(await page.evaluate(() => !!document.createElement('canvas').getContext('webgl2')), true);
    const mcp = await page.evaluate(() => window.directorDesktop.mcp());
    assert.equal(mcp.ok, true, mcp.error);
    assert.equal(mcp.data.enabled, true);
    const update = await page.evaluate(() => window.directorDesktop.update('check'));
    assert.equal(update.ok, true);
    assert.equal(update.data.mode, 'unsupported', 'Linux must not download a Windows installer');
    assert.equal(update.data.canDownload, false);
    await page.screenshot({ path: path.join(output, 'desktop.png') });
    assert.deepEqual(errors, []);
    console.log('PASS: packaged Linux binary, isolated profile, WebGL, encrypted MCP and platform-correct updates');
    console.log(JSON.stringify({ backend: runtime.backend, gpu: runtime.gpu }));
} finally {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await app.close().catch(() => {});
}
