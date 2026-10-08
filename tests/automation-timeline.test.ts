import test from 'node:test';
import assert from 'node:assert/strict';
import { demoProject } from '../src/model.ts';
import { applyOperations } from '../src/automation/edits.ts';
import { validateToolInput } from '../src/automation/validate.ts';
test('timeline edits split action source timing, snap overlapping movement and protect locks atomically', () => {
    const project = demoProject(), actor = project.entities.find(e => e.kind === 'actor')!;
    actor.clips = [{ id: 'walk', action: 'walk', start: 0, end: 4, speed: 1 }];
    const selection = { kind: 'action', entityId: actor.id, id: 'walk' };
    const split = applyOperations(project, [{ operation: 'timeline', patch: { action: 'split', selection, time: 2 } }]);
    const clips = split.entities.find(e => e.id === actor.id)!.clips;
    assert.equal(clips.length, 2); assert.equal(clips[1].offset, 2);
    const moved = applyOperations(split, [{ operation: 'timeline', patch: { action: 'move', selection, delta: 1 } }]);
    assert.equal(moved.entities.find(e => e.id === actor.id)!.clips.find(c => c.id === 'walk')!.start, 4);
    actor.locked = true;
    assert.throws(() => applyOperations(project, [{ operation: 'timeline', patch: { action: 'remove', selection } }]), /锁定/);
    assert.equal(actor.clips.length, 1);
    validateToolInput('director_apply', { revision: 1, requestId: 'timeline', operations: [{ operation: 'timeline', patch: { action: 'remove', selection } }] });
});
