const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const builtin = require('../src/automation/builtin-skill.json');
const { createOfficialSkill, OFFICIAL_SKILL_URL } = require('../desktop/skills/official.cjs');
const { contentVersion, validateOfficialSkill } = require('../desktop/skills/official-package.cjs');
const { createSkillStore } = require('../desktop/skills/store.cjs');
const { skillPackage } = require('../desktop/skills/package.cjs');

function edition(releaseVersion, marker = releaseVersion, contractVersion = builtin.contractVersion) {
    const next = structuredClone(builtin);
    next.releaseVersion = releaseVersion; next.contractVersion = contractVersion;
    next.instructions += '\n' + marker;
    next.references['references/online-workflow.md'] = next.instructions;
    next.references['references/prompt-writing.md'] += '\n' + marker;
    next.version = contentVersion(next); return next;
}
async function temporary(fn) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'director-official-skill-'));
    try { await fn(directory); } finally {
        assert.equal(path.dirname(directory), os.tmpdir()); assert.match(path.basename(directory), /^director-official-skill-/);
        await fs.rm(directory, { recursive: true, force: true });
    }
}

test('independent skill update reaches MCP reads, survives restart, preserves custom skills and user files', () => temporary(async directory => {
    const next = edition('1.1.0'), changed = [];
    const updater = createOfficialSkill({ directory, builtin, onChange: data => changed.push(data), fetcher: async (url, options) => {
        assert.equal(url, OFFICIAL_SKILL_URL); assert.equal(options.redirect, 'error'); return new Response(JSON.stringify(next));
    } });
    const store = createSkillStore({ directory, builtin, getBuiltin: updater.current });
    await fs.writeFile(path.join(directory, 'private-project.director'), 'untouched');
    await store.install(skillPackage([{ path: 'SKILL.md', bytes: Buffer.from('---\nname: custom\ndescription: custom rules\n---\ncustom-body') }]), 'local');
    const custom = (await store.list()).find(e => !e.builtin);
    await store.enable(custom.id, false);
    assert.equal((await updater.check()).status, 'available');
    assert.equal((await store.read({ knownVersion: builtin.version })).unchanged, true);
    await Promise.all([updater.install(), updater.install()]);
    assert.equal(changed.length, 1);
    const reading = await store.tool({ knownVersion: builtin.version });
    assert.equal(reading.unchanged, false); assert.equal(reading.releaseVersion, '1.1.0'); assert.equal(reading.instructions, next.instructions);
    assert.equal((await store.tool({ knownVersion: next.version })).unchanged, true);
    assert.match((await store.tool({ path: 'references/prompt-writing.md' })).instructions, /1\.1\.0/);
    assert.equal(await fs.readFile(path.join(directory, 'private-project.director'), 'utf8'), 'untouched');
    const restarted = createOfficialSkill({ directory, builtin });
    const restartedStore = createSkillStore({ directory, builtin, getBuiltin: restarted.current });
    assert.equal((await restartedStore.read()).version, next.version);
    assert.deepEqual((await restartedStore.list()).find(e => e.id === custom.id), { ...custom, enabled: false });
    assert.equal((await restartedStore.read({ id: custom.id }, true)).instructions.includes('custom-body'), true);
    const upgradedApp = createOfficialSkill({ directory, builtin: edition('1.2.0') });
    assert.equal((await upgradedApp.current()).releaseVersion, '1.2.0');
    const changedApp = createOfficialSkill({ directory, builtin: { ...builtin, contractVersion: 'sha256:' + 'b'.repeat(64) } });
    assert.equal((await changedApp.current()).version, builtin.version);
}));

test('checks reject corrupt/incompatible packages, do not downgrade, and recover after network errors', () => temporary(async directory => {
    let response = new Response('offline', { status: 503 });
    const updater = createOfficialSkill({ directory, builtin, fetcher: async () => response });
    assert.equal((await updater.check()).status, 'error');
    const corrupt = edition('1.1.0'); corrupt.references['references/prompt-writing.md'] += 'tampered';
    response = new Response(JSON.stringify(corrupt)); assert.equal((await updater.check()).status, 'error');
    assert.throws(() => validateOfficialSkill(corrupt), /校验/);
    response = new Response(JSON.stringify(edition('1.1.0', 'new tools', 'sha256:' + 'f'.repeat(64))));
    assert.equal((await updater.check()).status, 'incompatible'); await assert.rejects(updater.install(), /没有可安装/);
    for (const item of [builtin, edition('0.9.9')]) {
        response = new Response(JSON.stringify(item)); assert.equal((await updater.check()).status, 'current');
        await assert.rejects(updater.install(), /没有可安装/);
    }
    response = new Response(JSON.stringify(edition(builtin.releaseVersion, 'changed without release bump')));
    assert.equal((await updater.check()).status, 'error');
    response = new Response('{}', { headers: { 'content-length': 3 * 1024 * 1024 } });
    assert.equal((await updater.check()).status, 'error');
    response = new Response(JSON.stringify(edition('1.10.0'))); assert.equal((await updater.check()).status, 'available');
    await updater.install(); assert.equal((await updater.current()).releaseVersion, '1.10.0');
    response = new Response(JSON.stringify(edition('1.2.0'))); assert.equal((await updater.check()).status, 'current');
    assert.equal((await updater.current()).releaseVersion, '1.10.0');
}));

test('unreadable cache and failed writes keep a usable bundled skill', () => temporary(async directory => {
    await fs.mkdir(path.join(directory, 'skills'));
    await fs.writeFile(path.join(directory, 'skills', 'official.json'), '{broken');
    const updater = createOfficialSkill({ directory, builtin, fetcher: async () => new Response(JSON.stringify(edition('1.1.0'))) });
    assert.equal((await updater.current()).version, builtin.version); assert.equal(updater.state().status, 'error');
    assert.equal((await updater.check()).status, 'available');
    await fs.mkdir(path.join(directory, 'skills', 'official.json.tmp'));
    await assert.rejects(updater.install());
    assert.equal((await updater.current()).version, builtin.version);
    assert.equal(await fs.readFile(path.join(directory, 'skills', 'official.json'), 'utf8'), '{broken');
}));

test('simultaneous checks share one download', () => temporary(async directory => {
    let requests = 0;
    const updater = createOfficialSkill({ directory, builtin, fetcher: async () => { requests++; await new Promise(resolve => setTimeout(resolve, 10)); return new Response(JSON.stringify(edition('1.1.0'))); } });
    const results = await Promise.all([updater.check(), updater.check()]);
    assert.equal(requests, 1); assert.ok(results.every(result => result.status === 'available'));
}));
