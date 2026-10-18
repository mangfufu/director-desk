const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { updateTarget, updateMode, assertAppImageWritable } = require('../desktop/update-platform.cjs');
const { createUpdateConfig } = require('../desktop/update-config.cjs');
const { githubRelease } = require('../desktop/github-release.cjs');

test('only installed Windows and Linux AppImages enable automatic installation', () => {
    assert.equal(updateMode({ packaged: false, platform: 'linux', arch: 'x64', appImage: '/tmp/test.AppImage' }), 'development');
    assert.equal(updateMode({ packaged: true, platform: 'linux', arch: 'x64', appImage: '/tmp/test.AppImage' }), 'installed');
    for (const appImage of ['', 'relative.AppImage']) assert.equal(updateMode({ packaged: true, platform: 'linux', arch: 'x64', appImage }), 'unsupported');
    assert.equal(updateMode({ packaged: true, platform: 'linux', arch: 'arm64', appImage: '/tmp/test.AppImage' }), 'unsupported');
    assert.equal(updateMode({ packaged: true, platform: 'darwin', arch: 'arm64' }), 'unsupported');
    assert.equal(updateMode({ packaged: true, platform: 'win32', arch: 'x64', portable: true }), 'portable');
    assert.equal(updateMode({ packaged: true, platform: 'win32', arch: 'x64' }), 'installed');
});

test('GitHub only enables download with metadata AND the matching platform artifact', async () => {
    let names = ['latest.yml', 'DirectorDesk-Setup-0.5.0.1.exe'];
    const fetcher = async () => new Response(JSON.stringify({ tag_name: 'v0.5.0.1', assets: names.map(name => ({ name, state: 'uploaded' })) }));
    assert.ok((await githubRelease(fetcher, 'win32', 'x64')).feed);
    assert.equal((await githubRelease(fetcher, 'linux', 'x64')).feed, null);
    names.push('latest-linux.yml');
    assert.equal((await githubRelease(fetcher, 'linux', 'x64')).feed, null);
    names.push(updateTarget('linux', 'x64').artifact('0.5.0.1'));
    assert.ok((await githubRelease(fetcher, 'linux', 'x64')).feed);
    assert.equal((await githubRelease(fetcher, 'linux', 'arm64')).feed, null);
    names = ['latest-linux.yml', 'DirectorDesk-0.5.0.1-linux-x64.AppImage'];
    assert.equal((await githubRelease(fetcher, 'win32', 'x64')).feed, null);
});

test('Linux defaults migrate only the old official Windows URL; custom settings survive', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'director-linux-update-'));
    try {
        let store = createUpdateConfig(directory, 'linux', 'x64'); await store.ready;
        assert.equal(store.feed().url, 'https://bigthat.me/updates/linux-x64/');
        await fs.writeFile(path.join(directory, 'updates.json'), JSON.stringify({ url: 'https://bigthat.me/updates/win-x64/', automatic: false, source: 'github' }));
        store = createUpdateConfig(directory, 'linux', 'x64'); await store.ready;
        assert.deepEqual(store.read(), { url: 'https://bigthat.me/updates/linux-x64/', automatic: false, source: 'github' });
        await store.save({ url: 'https://example.org/my-linux-feed/', automatic: true, source: 'website' });
        store = createUpdateConfig(directory, 'linux', 'x64'); await store.ready;
        assert.equal(store.feed().url, 'https://example.org/my-linux-feed/');
        const appImage = path.join(directory, 'DirectorDesk.AppImage');
        await fs.writeFile(appImage, 'test'); assertAppImageWritable(appImage);
        assert.throws(() => assertAppImageWritable(directory), /可写目录/);
        assert.throws(() => assertAppImageWritable(path.join(directory, 'missing')), /可写目录/);
        if (process.platform !== 'win32' && process.getuid() !== 0) {
            await fs.chmod(directory, 0o555);
            assert.throws(() => assertAppImageWritable(appImage), /可写目录/);
            await fs.chmod(directory, 0o755);
        }
    } finally { await fs.chmod(directory, 0o755); await fs.rm(directory, { recursive: true, force: true }); }
});
