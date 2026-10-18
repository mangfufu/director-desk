const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createUpdateHost } = require('../desktop/update-host.cjs');
const { githubRelease, GITHUB_RELEASE_PAGE } = require('../desktop/github-release.cjs');
const { validateConfig } = require('../desktop/update-config.cjs');

function fixture({ source = 'auto', website = '1.1.0', github = '1.2.0', metadata = true, feedVersion = github, mode = 'installed', current = '1.0.0' } = {}) {
    const calls = [], states = []; let opened;
    const host = createUpdateHost({ version: current, mode,
        config: { ready: Promise.resolve(), read: () => ({ source }), feed: () => ({ url: 'https://website.test/' }), page: () => 'https://website.test/', save: async () => {} },
        getGithubRelease: async () => {
            calls.push('github'); if (github instanceof Error) throw github;
            return { version: github, notes: 'GitHub notes', page: GITHUB_RELEASE_PAGE, feed: metadata ? { url: 'https://github.com/release/' } : null };
        },
        makeUpdater: feed => {
            const target = feed.url.includes('github.com') ? 'github-feed' : 'website', next = target === 'website' ? website : feedVersion;
            const updater = new EventEmitter();
            updater.checkForUpdates = async () => {
                calls.push(target); if (next instanceof Error) { updater.emit('error', next); throw next; }
                updater.emit('update-available', { version: next, releaseNotes: target });
            };
            updater.downloadUpdate = async () => { calls.push('download:' + target); updater.emit('download-progress', { percent: 35 }); updater.emit('update-downloaded'); };
            return updater;
        },
        send: state => states.push(state), openPage: async url => { opened = url; }, confirmInstall: async () => false, install() { throw Error('No install in test'); },
    });
    return { host, calls, states, opened: () => opened };
}

test('automatic source compares both versions and downloads the selected GitHub tag through updater validation', async () => {
    const f = fixture({ website: '1.9.0', github: '1.10.0' });
    await f.host.check(); assert.equal(f.host.read().version, '1.10.0'); assert.equal(f.host.read().source, 'github');
    assert.equal(f.host.read().canDownload, true); assert.deepEqual(f.calls.sort(), ['github', 'website']);
    assert.equal(f.states.filter(s => s.phase === 'available').length, 1);
    await f.host.openPage(); assert.equal(f.opened(), GITHUB_RELEASE_PAGE);
    await f.host.download(); assert.equal(f.host.read().phase, 'downloaded');
    assert.ok(f.calls.includes('github-feed')); assert.ok(f.calls.includes('download:github-feed')); assert.ok(!f.calls.includes('download:website'));
});

test('website wins when newer or tied; selected sources do not contact the other service', async () => {
    for (const website of ['1.2.0', '1.3.0']) {
        const f = fixture({ website }); await f.host.check(); assert.equal(f.host.read().source, 'website');
        await f.host.download(); assert.ok(f.calls.includes('download:website'));
    }
    for (const source of ['website', 'github']) {
        const f = fixture({ source }); await f.host.check(); assert.deepEqual(f.calls, [source]);
    }
});

test('one failed source still discovers updates and states incomplete checking; both failures stay sanitized', async () => {
    for (const failed of ['website', 'github']) {
        const f = fixture({ [failed]: Error('401 private-token local-path') }); await f.host.check();
        assert.equal(f.host.read().phase, 'available'); assert.match(f.host.read().message, /暂不可用/);
        assert.equal(JSON.stringify(f.states).includes('private-token'), false);
    }
    const partial = fixture({ website: '1.0.0', github: Error('offline') }); await partial.host.check();
    assert.equal(partial.host.read().phase, 'current'); assert.match(partial.host.read().message, /仅检查/);
    const all = fixture({ website: Error('401 private'), github: Error('private') }); await all.host.check(); assert.equal(all.host.read().phase, 'error');
});

test('older GitHub uploads and portable apps allow manual download; mismatched metadata cannot download', async () => {
    const f = fixture({ metadata: false }); await f.host.check(); assert.equal(f.host.read().phase, 'available');
    assert.equal(f.host.read().canDownload, false); await assert.rejects(f.host.download());
    await f.host.openPage(); assert.equal(f.opened(), GITHUB_RELEASE_PAGE);
    const portable = fixture({ mode: 'portable' }); await portable.host.check(); assert.equal(portable.host.read().canDownload, false); await assert.rejects(portable.host.download());
    const mismatch = fixture({ feedVersion: '1.3.0' }); await mismatch.host.check(); await mismatch.host.download();
    assert.equal(mismatch.host.read().phase, 'error'); assert.equal(mismatch.calls.some(call => call.startsWith('download:')), false);
    const older = fixture({ website: '0.9.0', github: '1.0.0' }); await older.host.check(); assert.equal(older.host.read().phase, 'current');
    const prerelease = fixture({ website: '2.0.0-beta.1', github: '1.0.0' }); await prerelease.host.check(); assert.equal(prerelease.host.read().phase, 'current');
});

test('GitHub discovery accepts stable releases with or without metadata and uses fixed public repository URLs', async () => {
    let release = { tag_name: 'v1.2.3', body: 'Release notes', html_url: 'https://untrusted.invalid/', assets: [] };
    const fetcher = async (url, options) => {
        assert.equal(url, 'https://api.github.com/repos/mangfufu/director-desk/releases/latest');
        assert.equal(options.redirect, 'error'); assert.equal(options.headers.Authorization, undefined);
        return new Response(JSON.stringify(release));
    };
    const manual = await githubRelease(fetcher, 'win32', 'x64'); assert.equal(manual.version, '1.2.3'); assert.equal(manual.feed, null);
    assert.equal(manual.page, 'https://github.com/mangfufu/director-desk/releases/tag/v1.2.3');
    release.assets = ['latest.yml', 'DirectorDesk-Setup-1.2.3.exe'].map(name => ({ name, state: 'uploaded' }));
    assert.equal((await githubRelease(fetcher, 'win32', 'x64')).feed.url, 'https://github.com/mangfufu/director-desk/releases/download/v1.2.3/');
    release.tag_name = 'v0.4.7.1';
    release.assets = ['latest.yml', 'DirectorDesk-Setup-0.4.7.1.exe'].map(name => ({ name, state: 'uploaded' }));
    const revision = await githubRelease(fetcher, 'win32', 'x64');
    assert.equal(revision.version, '0.4.7.1');
    assert.equal(revision.feed.url, 'https://github.com/mangfufu/director-desk/releases/download/v0.4.7.1/');
    release.prerelease = true; await assert.rejects(githubRelease(fetcher, 'win32', 'x64')); release.prerelease = false;
    for (const tag of ['no-version', 'v2.0.0-rc.1']) { release.tag_name = tag; await assert.rejects(githubRelease(fetcher, 'win32', 'x64')); }
    await assert.rejects(githubRelease(async () => new Response('', { status: 403 })));
    assert.throws(() => validateConfig({ url: 'https://example.com/', automatic: true, source: 'untrusted' }));
});

test('revision releases compare numerically across sources and match SemVer transport metadata for download', async () => {
    const f = fixture({ current: '0.4.7+revision.1', website: '0.4.7.2', github: '0.4.7.10', feedVersion: '0.4.7+revision.10' });
    await f.host.check();
    assert.equal(f.host.read().currentVersion, '0.4.7.1');
    assert.equal(f.host.read().version, '0.4.7.10');
    assert.equal(f.host.read().source, 'github');
    await f.host.download(); assert.equal(f.host.read().phase, 'downloaded');
    const next = fixture({ current: '0.4.7.10', website: '0.4.8', github: '0.4.7.11' });
    await next.host.check(); assert.equal(next.host.read().version, '0.4.8');
    const same = fixture({ current: '0.4.7.1', website: '0.4.7+revision.1', github: '0.4.7' });
    await same.host.check(); assert.equal(same.host.read().phase, 'current');
    const mismatch = fixture({ current: '0.4.7', website: '0.4.7', github: '0.4.7.2', feedVersion: '0.4.7+revision.1' });
    await mismatch.host.check(); await mismatch.host.download();
    assert.equal(mismatch.host.read().phase, 'error');
    assert.equal(mismatch.calls.some(call => call.startsWith('download:')), false);
});
