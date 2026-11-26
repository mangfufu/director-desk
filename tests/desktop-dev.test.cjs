const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

async function fixture(t, prepared = true, executable = process.execPath) {
    const temporaryRoot = path.resolve('tmp');
    await fs.mkdir(temporaryRoot, { recursive: true });
    const root = await fs.mkdtemp(path.join(temporaryRoot, 'desktop dev '));
    t.after(async () => {
        assert.equal(path.dirname(root), temporaryRoot);
        await fs.rm(root, { recursive: true, force: true });
    });
    await fs.mkdir(path.join(root, 'scripts'), { recursive: true });
    await fs.copyFile('scripts/desktop-dev.mjs', path.join(root, 'scripts/desktop-dev.mjs'));
    await fs.mkdir(path.join(root, 'node_modules/electron'), { recursive: true });
    await fs.writeFile(path.join(root, 'node_modules/electron/index.js'), `module.exports=${JSON.stringify(executable)};`);
    if (prepared) {
        const app = path.join(root, '.audit/desktop-app');
        await fs.mkdir(path.join(app, 'desktop'), { recursive: true });
        await fs.mkdir(path.join(app, 'dist'), { recursive: true });
        await fs.writeFile(path.join(app, 'package.json'), JSON.stringify({ main: 'desktop/main.cjs' }));
        await fs.writeFile(path.join(app, 'dist/index.html'), '<html></html>');
        // A child process probe tests argument/env/exit propagation without opening a window.
        await fs.writeFile(path.join(app, 'desktop/main.cjs'), `
            console.log('PROBE:' + JSON.stringify({args:process.argv.slice(2),cwd:process.cwd(),nodeMode:process.env.ELECTRON_RUN_AS_NODE}));
            process.exit(Number(process.env.PROBE_EXIT_CODE || 0));
        `);
    }
    return { root, run: (args = [], env = {}) => spawnSync(process.execPath, [path.join(root, 'scripts/desktop-dev.mjs'), ...args], {
        cwd: os.tmpdir(), encoding: 'utf8', timeout: 15000,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', ...env },
    }) };
}

test('desktop launcher preserves spaced paths, removes Node mode, isolates profile and returns child exit status', async t => {
    const { root, run } = await fixture(t);
    const result = run(['--example=a value'], { PROBE_EXIT_CODE: '17' });
    assert.equal(result.status, 17, result.stderr);
    const probe = JSON.parse(result.stdout.split(/\r?\n/).find(line => line.startsWith('PROBE:')).slice(6));
    assert.equal(probe.cwd, root);
    assert.equal(probe.nodeMode, undefined);
    assert.deepEqual(probe.args, ['--example=a value', `--director-test-profile=${path.join(root, '.local/desktop-dev-profile')}`]);
    assert.equal((await fs.stat(path.join(root, '.local/desktop-dev-profile'))).isDirectory(), true);
    assert.deepEqual(await fs.readdir(path.join(root, 'tmp/desktop-runs')), []);
    const custom = run(['--director-test-profile=another profile']);
    assert.equal(custom.status, 0, custom.stderr);
    const customProbe = JSON.parse(custom.stdout.split(/\r?\n/).find(line => line.startsWith('PROBE:')).slice(6));
    assert.deepEqual(customProbe.args, ['--director-test-profile=another profile']);
});

test('desktop launcher explains how to build missing prepared files', async t => {
    const { run } = await fixture(t, false);
    const result = run();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /npm run desktop:dev/);
    assert.doesNotMatch(result.stdout, /PROBE:/);
});

test('desktop launcher reports Electron start failure as nonzero', async t => {
    const { root, run } = await fixture(t, true, path.join(os.tmpdir(), 'missing-electron-executable'));
    const result = run();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Could not start Electron/);
    assert.deepEqual(await fs.readdir(path.join(root, 'tmp/desktop-runs')), []);
});

test('preparing another build cannot remove the running desktop assets', async t => {
    const {root,run}=await fixture(t);
    await fs.writeFile(path.join(root,'.audit/desktop-app/desktop/main.cjs'),`
        const fs=require('node:fs'),path=require('node:path');
        fs.writeFileSync(path.join(process.cwd(),'.audit/desktop-app/dist/index.html'),'new build');
        console.log('SNAPSHOT:'+fs.readFileSync(path.join(__dirname,'../dist/index.html'),'utf8'));
    `);
    const result=run();assert.equal(result.status,0,result.stderr);
    assert.match(result.stdout,/SNAPSHOT:<html><\/html>/);
    assert.equal(await fs.readFile(path.join(root,'.audit/desktop-app/dist/index.html'),'utf8'),'new build');
    assert.deepEqual(await fs.readdir(path.join(root,'tmp/desktop-runs')),[]);
});
