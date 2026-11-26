import test from 'node:test';
import assert from 'node:assert/strict';
import { FULL_TOOL_DEFINITIONS, toolHelp } from '../src/automation/contract.ts';
import { HELP_TOPICS } from '../src/automation/help-topics.ts';
import { readBuiltinSkill } from '../src/automation/skill.ts';
import { createToolService } from '../src/automation/service.ts';
import { validateToolInput } from '../src/automation/validate.ts';
import { assertProductionShape } from '../src/production/validation.ts';
import type { AppContext } from '../src/app-context.ts';

test('topic help returns exactly one shipped reference through the service', async () => {
    const service = createToolService({} as AppContext);
    for (const [topic, path] of Object.entries(HELP_TOPICS)) {
        const result = await service.call('director_help', { topic });
        assert.equal(result.ok, true, result.error ?? 'topic request failed');
        assert.deepEqual(result.data, { tools: [], guide: { topic, ...readBuiltinSkill(undefined, path) } });
    }
    for (const args of [{}, { topic: 'unknown' }, { topic: 'camera', names: ['director_apply'] }, { topic: 'camera', full: true }]) {
        assert.equal((await service.call('director_help', args)).ok, false);
    }
});

test('default apply help is focused, while explicit full help retains the complete contract', async () => {
    const full = toolHelp(['director_apply'], { full: true });
    const focused = toolHelp(['director_apply']);
    assert.deepEqual(focused.tools[0].inputSchema, full.tools[0].inputSchema);
    assert.ok(JSON.stringify(focused).length < JSON.stringify(full).length * .3);
    assert.deepEqual(full.tools[0], FULL_TOOL_DEFINITIONS.find(t => t.name === 'director_apply'));
    const service = createToolService({} as AppContext);
    assert.deepEqual((await service.call('director_help', { names: ['director_apply'] })).data, focused);
    assert.deepEqual((await service.call('director_help', { names: ['director_apply'], full: true })).data, full);
});

test('operation help batches only requested examples with a shared version', async () => {
    const service = createToolService({} as AppContext);
    const result = await service.call('director_help', { operations: ['motion', 'path', 'motion'] });
    assert.equal(result.ok, true, result.error ?? 'operation help failed');
    assert.deepEqual(result.data.guide.operations, ['motion', 'path']);
    assert.equal(result.data.guide.version, readBuiltinSkill().version);
    assert.match(result.data.guide.instructions, /"operation":"motion".*"asset":"basic-sit"/);
    assert.ok(result.data.guide.instructions.length < toolHelp(undefined, { topic: 'editing' }).guide!.instructions!.length / 5);
    for (const args of [{ operations: ['missing'] }, { operations: ['motion'], names: ['director_apply'] }, { operations: ['motion'], topic: 'editing' }]) {
        assert.equal((await service.call('director_help', args)).ok, false);
    }
});

test('every published operation example can be passed directly to its tool schema', () => {
    const instructions = readBuiltinSkill(undefined, 'references/operations.md').instructions!;
    const examples = [...instructions.matchAll(/\x60(director_[a-z_]+)\((\{[^\n]*?\})\)\x60/g)];
    assert.ok(examples.length > 15);
    for (const [, name, args] of examples) validateToolInput(name, JSON.parse(args));
});

test('production errors identify the field without repeating the complete guide', () => {
    const valid = { fixedPrompt: '', sceneReferenceIds: [], notes: [] };
    assert.doesNotThrow(() => assertProductionShape(valid));
    for (const [data, field] of [[{ ...valid, fixedPrompt: 5 }, 'fixedPrompt'], [{ ...valid, notes: false }, 'notes']] as const) {
        assert.throws(() => assertProductionShape(data), (error: Error) => {
            assert.ok(error.message.includes(field));
            assert.ok(error.message.length < 200);
            assert.ok(!error.message.includes('textOnlyPrompt'));
            return true;
        });
    }
});
