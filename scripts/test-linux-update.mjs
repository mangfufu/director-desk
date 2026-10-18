import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { execFileSync } from 'node:child_process';
import { X509Certificate, randomUUID } from 'node:crypto';
import { _electron as electron } from 'playwright-core';
import yaml from 'js-yaml';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { releaseVersion } from '../desktop/release-version.cjs';

assert.equal(process.platform, 'linux');
const oldImage = path.resolve(process.argv[2]);
const feedDirectory = path.resolve(process.argv[3]);
const metadata = yaml.load(await fs.readFile(path.join(feedDirectory, 'latest-linux.yml'), 'utf8'));
const nextVersion = releaseVersion(metadata.version);
const artifact = metadata.files.find(file => file.url.endsWith('.AppImage')).url;
assert.equal(path.basename(artifact), artifact);
await fs.mkdir('output/linux-upgrade', { recursive: true });
const root = await fs.mkdtemp(path.resolve('output/linux-upgrade/run-'));
const config = path.join(root, 'config'), profile = path.join(config, 'DirectorDesk');
const installed = path.join(root, 'app', 'DirectorDesk.AppImage');
await fs.mkdir(path.dirname(installed)); await fs.mkdir(profile, { recursive: true });
await fs.copyFile(oldImage, installed); await fs.chmod(installed, 0o755);
// Local fixture certificate only; no certificate exceptions enter the application.
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(root, 'key.pem'),
    '-out', path.join(root, 'cert.pem'), '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=IP:127.0.0.1'], { stdio: 'ignore' });
const cert = await fs.readFile(path.join(root, 'cert.pem'));
let corrupt = true, offline = false;
const requested = [];
const server = https.createServer({ cert, key: await fs.readFile(path.join(root, 'key.pem')) }, async (req, res) => {
    const file = new URL(req.url, 'https://localhost').pathname.slice(1); requested.push(file);
    if (offline) { res.writeHead(503); res.end(); return; }
    if (file === 'latest-linux.yml') {
        const info = structuredClone(metadata);
        if (corrupt) { info.files[0].sha512 = Buffer.alloc(64).toString('base64'); info.sha512 = info.files[0].sha512; }
        res.end(yaml.dump(info));
    } else if (file === artifact) {
        const full = path.join(feedDirectory, artifact);
        res.writeHead(200, { 'Content-Length': (await fs.stat(full)).size });
        const stream = createReadStream(full); res.on('close', () => stream.destroy()); stream.pipe(res);
    } else { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `https://127.0.0.1:${server.address().port}/`;
await fs.writeFile(path.join(profile, 'updates.json'), JSON.stringify({ source: 'website', automatic: true, url }));
const conversation = { version: 1, sessionId: randomUUID(), profileId: '', entries: [{ type: 'user', text: 'Linux upgrade persistence test' }] };
await fs.writeFile(path.join(profile, 'ai-conversation.json'), JSON.stringify(conversation));
const env = { ...process.env, XDG_CONFIG_HOME: config, XDG_CACHE_HOME: path.join(root, 'cache') };
delete env.ELECTRON_RUN_AS_NODE;
let app, client, token, endpoint, savedFile, savedBytes;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const raw = async (name, args = {}) => JSON.parse((await client.callTool({ name, arguments: args })).content.find(c => c.type === 'text').text);
const call = async (name, args = {}) => { const result = await raw(name, args); assert.equal(result.ok, true, result.error); return result.data; };
async function connect() {
    client = new Client({ name: 'linux-upgrade-test', version: '1' });
    await client.connect(new StreamableHTTPClientTransport(new URL(endpoint), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
}
try {
    app = await electron.launch({ executablePath: installed, args: [], env, timeout: 60000 });
    await app.evaluate(async ({ session, dialog }, fixture) => {
        const network = session.fromPartition('electron-updater');
        await network.setProxy({ mode: 'direct' });
        network.setCertificateVerifyProc((request, callback) => {
            const valid = request.hostname === '127.0.0.1' && new (process.getBuiltinModule('crypto').X509Certificate)(request.certificate.data).fingerprint256 === fixture.fingerprint;
            callback(valid ? 0 : -3);
        });
        globalThis.updateTestConfirm = false;
        dialog.showMessageBoxSync = () => globalThis.updateTestConfirm ? 1 : 0;
    }, { url, fingerprint: new X509Certificate(cert).fingerprint256 });
    const page = await app.firstWindow();
    await page.locator('#timeline-content .track-lane').first().waitFor();
    assert.equal(await app.evaluate(({ app }) => app.getPath('userData')), profile);
    assert.equal(await app.evaluate(() => process.env.APPIMAGE), installed);
    const state = await page.evaluate(() => window.directorDesktop.update('state'));
    assert.equal(state.data.mode, 'installed');
    const mcp = await page.evaluate(() => window.directorDesktop.mcp());
    endpoint = mcp.data.url;
    const connection = JSON.parse(await fs.readFile(path.join(profile, 'mcp-connection.json'), 'utf8'));
    token = await app.evaluate(({ safeStorage }, secret) => safeStorage.decryptString(Buffer.from(secret, 'base64')), connection.secret);
    await connect();
    await call('director_settings', { scope: 'editor', action: 'set', patch: { navigationSpeed: 4 }, requestId: 'editor-settings' });
    await call('director_settings', { scope: 'files', action: 'set', patch: { projects: root, exports: root }, requestId: 'file-settings' });
    const job = await call('director_export', { kind: 'project', filename: 'upgrade.director', requestId: 'save-project' });
    for (let i = 0; i < 100; i++) {
        const progress = await call('director_job', { id: job.jobId });
        if (progress.status !== 'running') {
            assert.equal(progress.status, 'completed', progress.error); savedFile = progress.result.files[0].path; break;
        }
        await sleep(100);
    }
    savedBytes = await fs.readFile(savedFile);
    const before = await call('director_read', { sections: ['entities'] });
    assert.match((await page.evaluate(() => window.directorDesktop.conversation())).data.transcript, /Linux upgrade persistence test/);
    // Wait for the normal startup check, then exercise the existing update UI.
    await page.waitForFunction(() => document.querySelector('#update-download')?.disabled === false, undefined, { timeout: 30000 }).catch(async error => {
        console.log('Update diagnostic', await page.evaluate(() => window.directorDesktop.update('state')), requested); throw error;
    });
    await page.locator('#update-download').click();
    await page.waitForFunction(() => document.querySelector('#update-message').value.includes('校验失败'), undefined, { timeout: 60000 });
    console.log('PASS: corrupt update rejected');
    assert.equal(await page.locator('#update-install').isDisabled(), true);
    assert.equal(await fs.stat(installed).then(s => s.size), await fs.stat(oldImage).then(s => s.size));
    offline = true;
    await page.locator('#update-check').click();
    await page.waitForFunction(() => document.querySelector('#update-message').value.includes('失败'), undefined, { timeout: 30000 });
    offline = false; corrupt = false;
    await page.locator('#update-check').click();
    await page.waitForFunction(() => !document.querySelector('#update-download').disabled);
    await page.locator('#update-download').click();
    await page.waitForFunction(() => !document.querySelector('#update-install').disabled, undefined, { timeout: 60000 });
    await fs.chmod(path.dirname(installed), 0o555);
    await page.locator('#update-install').click();
    await page.waitForFunction(() => document.querySelector('#update-message').value.includes('可写目录'));
    await fs.chmod(path.dirname(installed), 0o755);
    await page.locator('#update-install').click(); // Cancel native confirmation.
    await page.waitForFunction(() => !document.querySelector('#update-install').disabled);
    assert.equal((await page.evaluate(() => window.directorDesktop.update('state'))).data.phase, 'downloaded');
    await page.screenshot({ path: path.join(root, 'ready-to-update.png') });
    console.log('PASS: download, network failure, write permissions and cancel');
    await client.close(); client = null;
    await app.evaluate(() => { globalThis.updateTestConfirm = true; });
    // The FUSE helper can outlive Electron while the new image starts.
    const closed = page.waitForEvent('close', { timeout: 30000 });
    await page.locator('#update-install').click().catch(() => {});
    await closed;
    console.log('Old window closed; waiting for restarted MCP');
    for (let i = 0; i < 100; i++) {
        try { await connect(); break; } catch { await client?.close().catch(() => {}); client = null; await sleep(300); }
    }
    assert.ok(client, 'Updated app restarted and reconnected MCP');
    console.log('Restarted version:', client.getServerVersion().version);
    assert.equal(client.getServerVersion().version, nextVersion, 'The new executable is actually running');
    let after;
    for (let i = 0; i < 100; i++) {
        const result = await raw('director_read', { sections: ['entities'] });
        if (result.ok) { after = result.data; break; } await sleep(100);
    }
    assert.equal(after.name, before.name); assert.deepEqual(after.entities, before.entities);
    assert.equal((await call('director_settings', { scope: 'editor', action: 'read' })).values.navigationSpeed, 4);
    assert.deepEqual(await fs.readFile(savedFile), savedBytes);
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(profile, 'ai-conversation.json'), 'utf8')), conversation);
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(profile, 'mcp-connection.json'), 'utf8')), connection);
    assert.equal((await fs.stat(installed)).size, (await fs.stat(path.join(feedDirectory, artifact))).size);
    assert.ok(requested.includes('latest-linux.yml')); assert.ok(!requested.some(name => name.endsWith('.exe') || name === 'latest.yml'));
    console.log(`PASS: AppImage ${state.data.currentVersion} -> ${nextVersion}; real UI download, SHA512 rejection, network failure, writable-directory check, cancel, install and restart; project/settings/conversation/MCP retained.`);
} finally {
    await fs.chmod(path.dirname(installed), 0o755);
    await client?.close().catch(() => {});
    // The authenticated, isolated MCP listener identifies the restarted test process.
    if (endpoint) {
        const listeners = execFileSync('ss', ['-ltnp', `sport = :${new URL(endpoint).port}`], { encoding: 'utf8' });
        for (const match of listeners.matchAll(/pid=(\d+)/g)) {
            try { process.kill(Number(match[1]), 'SIGTERM'); } catch { /* already exited */ }
        }
    }
    // AppImage's original FUSE process may retain Playwright's pipe after restart.
    if (app) {
        app.process().kill('SIGKILL');
        await Promise.race([app.close().catch(() => {}), sleep(5000)]);
    }
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
