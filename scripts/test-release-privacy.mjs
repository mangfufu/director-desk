import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { publicFiles as publicSkillFiles, referenceFiles } from './builtin-skill-files.cjs';

const scanner = path.resolve('scripts/check-release-privacy.mjs');
const parent = path.resolve('tmp'); await fs.mkdir(parent, { recursive: true });
const fixture = await fs.mkdtemp(path.join(parent, 'privacy-test-'));
const run = (...args) => spawnSync(process.execPath, [scanner, ...args], { cwd: fixture, encoding: 'utf8' });
try {
    await fs.mkdir(path.join(fixture, 'dist/assets'), { recursive: true });
    // The release gate now requires the bundled motion payload and desktop/helper inputs as well as web files.
    for (const relative of ['src/animation/library/humanoid-v1.json', 'src/animation/library/humanoid-v1-manifest.json',
        'desktop/main.cjs', 'desktop/preload.cjs', 'desktop/integration.cjs', 'desktop/media-import.cjs', 'desktop/file-host.cjs', 'desktop/files.cjs', 'desktop/ai-host.cjs', 'desktop/ai-conversation.cjs', 'desktop/providers.cjs', 'desktop/update-config.cjs', 'desktop/update-host.cjs', 'desktop/updates.cjs',
        'desktop/model-limits.cjs', 'desktop/director-prompt.cjs', 'desktop/mcp-server.cjs', 'desktop/mcp-config.cjs', 'desktop/mcp-host.cjs', 'desktop/mcp-connection.cjs', 'desktop/mcp-stdio.cjs',
        'desktop/language.cjs', 'desktop/conversation-store.cjs', 'desktop/ai-call-batches.cjs', 'desktop/automation-files.cjs', 'desktop/model-files.ts',
        'desktop/extensions.cjs', 'desktop/extensions/host.cjs', 'desktop/extensions/store.cjs', 'desktop/extensions/worker.cjs',
        ...publicSkillFiles.map(file => 'skills/director-desk/' + file)]) {
        const destination = path.join(fixture, relative); await fs.mkdir(path.dirname(destination), { recursive: true });
        await fs.copyFile(relative, destination);
    }
    const motion = JSON.parse(await fs.readFile('src/animation/library/humanoid-v1.json', 'utf8'));
    await fs.writeFile(path.join(fixture, 'dist/assets/motion-test.js'), 'export default ' + JSON.stringify(motion));
    const vendor = path.join(fixture, 'dist/assets/three.core-test.js'); await fs.writeFile(vendor, 'export const vendor = true;');
    const worker = path.join(fixture, 'dist/assets/model-import.worker-test.js'); await fs.writeFile(worker, 'self.onmessage = () => {};');
    await fs.writeFile(path.join(fixture, 'dist/index.html'), '<div>Public product</div>');
    const js = path.join(fixture, 'dist/assets/app-test.js');
    await fs.writeFile(js, 'export const value = 1;'); assert.equal(run().status, 0);
    // Private content can survive only in an inactive scene or its frozen predecessor.
    await fs.mkdir(path.join(fixture, 'examples'), { recursive: true });
    const terms = ['private-production-fixture', 'private-scene-fixture', 'private-actor-fixture', 'private-image-fixture', 'private-origin-story-fixture', 'private-origin-dialogue-fixture', 'private-fixed-prompt-fixture'];
    await fs.writeFile(path.join(fixture, 'examples/multi.director'), JSON.stringify({ version: 3, name: terms[0], scenes: [
        { name: terms[1], state: {}, origin: { state: { entities: [{ kind: 'actor', name: terms[2] }], references: [{ name: terms[3] }], production: { fixedPrompt: terms[6], notes: [{ story: terms[4] }] } }, notes: [{ dialogue: terms[5] }] } },
    ] }));
    for (const term of terms) {
        await fs.writeFile(js, term); const result = run(); assert.equal(result.status, 1);
        assert.ok(result.stderr.includes('local-private-term')); assert.ok(!result.stderr.includes(term));
    }
    await fs.writeFile(js, 'export const value = 1;'); assert.equal(run().status, 0);
    // Every on-demand reference is scanned in its source and staged offline copy.
    const stagedRoot = path.join(fixture, '.audit/desktop-app');
    for (const file of publicSkillFiles) {
        const destination = path.join(stagedRoot, 'skills/director-desk', file);
        await fs.mkdir(path.dirname(destination), { recursive: true });
        await fs.copyFile(path.join(fixture, 'skills/director-desk', file), destination);
    }
    await fs.mkdir(path.join(stagedRoot, 'desktop'), { recursive: true });
    for (const file of ['mcp-stdio.cjs', 'files.cjs', 'integration.cjs', 'tools-contract.cjs', 'updates.cjs', 'extensions.cjs', 'extension-worker.cjs'])
        await fs.writeFile(path.join(stagedRoot, 'desktop', file), 'module.exports = {};');
    assert.equal(run('--desktop').status, 0);
    for (const file of referenceFiles) {
        for (const prefix of ['', '.audit/desktop-app/']) {
            const relative = prefix + 'skills/director-desk/' + file, target = path.join(fixture, relative);
            const original = await fs.readFile(target);
            await fs.writeFile(target, 'sk-' + 'r'.repeat(24));
            const result = run('--desktop');
            assert.equal(result.status, 1, relative);
            assert.ok(result.stderr.includes(relative)); assert.ok(result.stderr.includes('credential-token'));
            assert.ok(!result.stderr.includes('r'.repeat(24)), 'Reference diagnostics must not echo private matches');
            await fs.writeFile(target, original);
        }
    }
    assert.equal(run('--desktop').status, 0);
    await fs.writeFile(path.join(fixture, 'examples/generic.director'), JSON.stringify({ entities: [{ kind: 'actor', name: '人物 · privacy-fixture-role' }] }));
    await fs.writeFile(js, '人物'); assert.equal(run().status, 0, 'A derived generic role prefix is public vocabulary');
    await fs.writeFile(js, '人物 · privacy-fixture-role'); assert.equal(run().status, 1, 'Full actor names remain protected');
    await fs.writeFile(path.join(fixture, 'examples/starter.director'), JSON.stringify({ version: 3, scenes: [{ name: '第一场', state: { entities: [{ kind: 'actor', name: '人物 A · 床边' }] } }] }));
    await fs.writeFile(js, '第一场 人物 A · 床边'); assert.equal(run().status, 0, 'Known public starter labels may be inherited into examples');
    await fs.mkdir(path.join(fixture, '.audit'), { recursive: true });
    await fs.writeFile(path.join(fixture, '.audit/release-private-terms.json'), JSON.stringify(['人物']));
    await fs.writeFile(js, '人物'); assert.equal(run().status, 1, 'Explicit private terms always take precedence');
    await fs.writeFile(path.join(fixture, '.audit/release-private-terms.json'), '[]');
    await fs.writeFile(js, 'export const value = 1;'); assert.equal(run().status, 0);
    for (const [value, rule] of [
        ['sk-' + 'x'.repeat(24), 'credential-token'],
        ['C:' + '/Users/' + 'fictional-user/private-file', 'absolute-windows-path'],
        ['sourceMappingURL=private.map', 'development-hook'],
    ]) {
        await fs.writeFile(js, value); const result = run(); assert.equal(result.status, 1);
        assert.ok(result.stderr.includes(rule)); assert.ok(!result.stderr.includes(value), 'Do not echo private matches');
    }
    await fs.writeFile(js, 'export const value = 1;');
    await fs.writeFile(vendor, 'sk-' + 'z'.repeat(24)); assert.ok(run().stderr.includes('credential-token'));
    await fs.writeFile(vendor, 'export const vendor = true;');
    await fs.writeFile(worker, 'sk-' + 'w'.repeat(24)); assert.ok(run().stderr.includes('credential-token'));
    await fs.writeFile(worker, 'self.onmessage = () => {};');
    const forbidden = path.join(fixture, 'dist/private.director'); await fs.writeFile(forbidden, '{}');
    assert.equal(run().status, 1); await fs.unlink(forbidden);
    await fs.mkdir(path.join(fixture, '.audit'), { recursive: true });
    await fs.writeFile(path.join(fixture, '.audit/release-private-terms.json'), JSON.stringify(['fictional-private-name']));
    await fs.writeFile(js, 'fictional-private-name'); assert.equal(run().status, 1);
    await fs.writeFile(js, 'export const value = 1;'); assert.equal(run().status, 0);
    console.log('Privacy gate verified: clean pass, credential/path/map/private-term and non-allowlisted file rejection, redacted diagnostics.');
} finally {
    const resolved = path.resolve(fixture);
    if (path.dirname(resolved) !== parent || !path.basename(resolved).startsWith('privacy-test-')) throw new Error('Unexpected fixture cleanup path');
    await fs.rm(resolved, { recursive: true });
}
