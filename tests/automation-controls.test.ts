import test from 'node:test';
import assert from 'node:assert/strict';
import { demoProject } from '../src/model.ts';
import { applyOperations } from '../src/automation/edits.ts';
import { validateToolInput } from '../src/automation/validate.ts';
import { editSettings } from '../src/automation/settings.ts';
import { editIndependentScene } from '../src/automation/scene-tools.ts';
import { readSceneDocument } from '../src/scenes/sequence-project.ts';
import { isDiscussionToolCall } from '../src/automation/contract.ts';

test('MCP settings validates an entire patch before publishing any change', async () => {
    const before = await editSettings({ scope: 'editor', action: 'read' });
    await assert.rejects(editSettings({ scope: 'editor', action: 'set', patch: { navigationSpeed: 5, zoomSpeed: -10 } }));
    assert.deepEqual(await editSettings({ scope: 'editor', action: 'read' }), before);
});
test('preview selection union rejects invalid ranges and accepts explicit clearing', () => {
    validateToolInput('director_view', { timeRange: null });
    validateToolInput('director_view', { timeRange: { start: 0, end: 2 } });
    assert.throws(() => validateToolInput('director_view', { timeRange: 0 }));
    assert.throws(() => validateToolInput('director_view', { timeRange: { start: 0, end: 2, unknown: true } }));
});
test('lock, duplication and position-key operations share normal invariants', () => {
    const original = demoProject(), id = original.entities.find(e => e.kind === 'actor')!.id;
    const locked = applyOperations(original, [{ operation: 'lock', id, value: true }]);
    assert.throws(() => applyOperations(locked, [{ operation: 'update', id, patch: { name: 'blocked' } }]));
    const unlocked = applyOperations(locked, [{ operation: 'lock', id, value: false }]);
    const next = applyOperations(unlocked, [{ operation: 'position-key', id, time: 1, position: [1, 0, 2] }, { operation: 'duplicate', id }]);
    assert.equal(next.entities.length, original.entities.length + 1);
    assert.deepEqual(next.entities.find(e => e.id === id)!.path!.points.find(p => p.time === 1)!.position, [1, 0, 2]);
    assert.equal(original.entities.find(e => e.id === id)!.locked, false);
});
test('explicit new-project replaces document with a selected template; create remains another independent scene', () => {
    const document = readSceneDocument(demoProject());
    const next = editIndependentScene(document, { action: 'new-project', name: 'Empty document', template: 'blank' });
    assert.equal(next.name, 'Empty document'); assert.equal(next.scenes.length, 1);
    assert.ok(next.scenes[0].state.entities.length < document.scenes[0].state.entities.length);
    assert.equal(editIndependentScene(document, { action: 'create', name: 'Another scene', template: 'blank' }).scenes.length, 2);
});
test('draw and record route operations share timing and retain earlier recorded motion', () => {
    const project = demoProject(), actor = project.entities.find(e => e.kind === 'actor')!;
    actor.position = [0, 0, 0]; actor.path = null; actor.clips = [];
    const route = applyOperations(project, [{ operation: 'draw-path', id: actor.id, patch: { time: 0, duration: 3, points: [[0,0,0],[1,0,0],[1,1,0]] } }]);
    assert.deepEqual(route.entities.find(e => e.id === actor.id)!.path!.points.map(p => p.time), [0,1.5,3]);
    const recorded = applyOperations(route, [{ operation: 'record-motion', id: actor.id, patch: { time: 3, mode: 'auto', segments: [{ duration: 1, keys: ['KeyW','ShiftLeft'], forward: [0,0,1] }] } }]);
    const e = recorded.entities.find(e => e.id === actor.id)!;
    assert.ok(Math.abs(e.path!.points.at(-1)!.position[2] - 5) < 1e-8);
    assert.equal(e.path!.points.at(-1)!.time, 4); assert.equal(e.clips.at(-1)!.action, 'run');
    assert.throws(() => applyOperations(project, [{ operation: 'record-motion', id: actor.id, patch: { segments: [{ duration: -1, keys: [], forward: [0,0,1] }] } }]));
    assert.equal(actor.path, null);
});
test('discussion only exposes read operations for mixed local libraries and settings', () => {
    assert.equal(isDiscussionToolCall('director_settings', { scope: 'editor', action: 'read' }), true);
    assert.equal(isDiscussionToolCall('director_settings', { scope: 'editor', action: 'set', patch: {} }), false);
    assert.equal(isDiscussionToolCall('director_motion_library', { action: 'remove', id: 'x' }), false);
    assert.equal(isDiscussionToolCall('director_application', { scope: 'skills', action: 'enable', data: { id:'builtin', enabled:false } }), false);
    assert.equal(isDiscussionToolCall('director_application', { scope: 'skills', action: 'read', data: { id:'builtin' } }), true);
});
