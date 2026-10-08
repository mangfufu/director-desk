import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('shipped offline CLI shares group/array and portable staging rules across independent scenes', async () => {
    const prefix = path.join(os.tmpdir(), 'director-staging-test-'), root = await fs.mkdtemp(prefix);
    const tool = fileURLToPath(new URL('../skills/director-desk/scripts/project-tool.mjs', import.meta.url));
    const file = (name: string) => path.join(root, name), run = (...args: string[]) => execFileSync(process.execPath, [tool, ...args], { encoding: 'utf8', windowsHide: true });
    const read = async (name: string) => JSON.parse(await fs.readFile(file(name), 'utf8'));
    const write = (name: string, value: unknown) => fs.writeFile(file(name), JSON.stringify(value));
    try {
        run('create', file('base.director'), '--template', 'blank');
        await write('operations.json', [
            { operation: 'add', asset: 'cube', id: 'a', position: [2, 0, 0] },
            { operation: 'add', asset: 'cube', id: 'b', position: [4, 0, 0] },
            { operation: 'group', id: 'g', name: '两件组合', patch: { action: 'create', entityIds: ['a', 'b'] } },
            { operation: 'arrange', patch: { action: 'array', entityIds: ['a', 'b'], shape: 'line', count: 3, step: [0, 0, 4] } },
        ]);
        run('apply', file('base.director'), file('operations.json'), file('groups.director'));
        const groups = await read('groups.director'); assert.equal(groups.groups.length, 3);
        await write('selection.json', { name: '可分享布景', entityIds: ['a', 'b'] });
        run('staging-save', file('groups.director'), file('selection.json'), file('module.staging'));
        await write('scene.json', { action: 'copy', name: '第二场', newSceneId: 'second' });
        run('scene', file('groups.director'), file('scene.json'), file('multi.director'));
        const before = await read('multi.director');
        await write('placement.json', { position: [10, 1, 0] });
        run('staging-insert', file('multi.director'), file('module.staging'), file('result.director'), file('placement.json'));
        assert.equal(JSON.parse(run('validate', file('result.director'))).ok, true);
        const final = await read('result.director');
        assert.deepEqual(final.scenes[0], before.scenes[0]);
        const state = final.scenes.find((s: { id: string }) => s.id === 'second').state;
        assert.equal(state.groups.length, 4); assert.deepEqual(state.cuts, before.scenes[1].state.cuts);
        const ids = new Set(state.groups[3].entityIds);
        assert.deepEqual(state.entities.filter((e: { id: string }) => ids.has(e.id)).map((e: { position: number[] }) => e.position), [[9, 1, 0], [11, 1, 0]]);
        assert.ok(!JSON.stringify(final).includes(root));
    } finally { assert.ok(path.resolve(root).startsWith(path.resolve(prefix))); await fs.rm(root, { recursive: true, force: true }); }
});
