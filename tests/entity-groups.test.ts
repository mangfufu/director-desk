import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { assertProject, entity, clone } from '../src/model.ts';
import { createScene } from '../src/scenes.ts';
import { applyOperations, changeSummary } from '../src/automation/edits.ts';
import { transformEntities } from '../src/building/group-editing.ts';
import { readSceneDocument, projectForScene, duplicateDocumentScene } from '../src/scenes/sequence-project.ts';
import { mergeScene } from '../src/scenes/merge-project.ts';
import { validateToolInput } from '../src/automation/validate.ts';
import { entityPosition, entityYaw } from '../src/timeline.ts';
import { beginGroupDrag } from '../src/editor/group-transform-drag.ts';
import { syncStructureLinks } from '../src/building/structure-links.ts';
import { defaultPhysicsBody } from '../src/physics/model.ts';

function fixture() {
    const p = createScene('blank'), a = entity('actor', 'person', 'A', [1, 0, 0]), b = entity('prop', 'cube', 'B', [3, 0, 0]);
    a.id = 'a'; b.id = 'b'; a.path = { smooth: false, points: [{ time: 0, position: [1, 0, 0] }, { time: 2, position: [1, 0, 2] }] };
    p.entities.push(a, b);
    return applyOperations(p, [{ operation: 'group', id: 'g', name: '测试组', patch: { action: 'create', entityIds: ['a', 'b'] } }]);
}
test('group membership validates and legacy/multi-scene round trips retain independent groups', () => {
    const p = fixture(); assertProject(p);
    const doc = readSceneDocument(JSON.parse(JSON.stringify(p)));
    assert.deepEqual(projectForScene(doc).groups, p.groups);
    const copied = duplicateDocumentScene(doc, doc.activeSceneId, '第二场', 'scene-copy');
    assert.deepEqual(projectForScene(copied, 'scene-copy').groups, p.groups);
    const other = projectForScene(copied, 'scene-copy'); other.groups![0].name = '改名';
    assert.equal(projectForScene(copied, doc.activeSceneId).groups![0].name, '测试组');
    assert.throws(() => applyOperations(p, [{ operation: 'group', id: 'g2', patch: { action: 'create', entityIds: ['a'] } }]), /重复/);
    assert.throws(() => applyOperations(p, [{ operation: 'group', id: 'g2', patch: { action: 'create', entityIds: ['missing'] } }]), /不存在/);
});
test('rigid group movement rotates the full path and moves camera targets without retiming', () => {
    const p = fixture(), camera = p.entities.find(e => e.camera)!;
    p.groups![0].entityIds.push(camera.id); camera.camera!.target = [1, 1, 2];
    camera.camera!.targetPath = { smooth: false, points: [{ time: 0, position: [1, 1, 2] }, { time: 2, position: [1, 1, 3] }] };
    const next = applyOperations(p, [{ operation: 'group', id: 'g', patch: { action: 'transform', rotation: [0, Math.PI / 2, 0], translation: [10, 0, 0], pivot: [0, 0, 0] } }]);
    for (const t of [0, .5, 1, 2]) {
        const expected = entityPosition(p.entities.find(e => e.id === 'a')!, t).applyAxisAngle(new Vector3(0, 1, 0), Math.PI / 2).add(new Vector3(10, 0, 0));
        assert.ok(entityPosition(next.entities.find(e => e.id === 'a')!, t).distanceTo(expected) < 1e-8);
        assert.ok(Math.abs(entityYaw(next.entities.find(e => e.id === 'a')!, t, next) - Math.PI / 2) < 1e-8);
    }
    assert.ok(new Vector3(...next.entities.find(e => e.id === camera.id)!.camera!.target).distanceTo(new Vector3(12, 1, -1)) < 1e-8);
    assert.equal(next.entities.find(e => e.id === camera.id)!.camera!.targetPath!.points[1].time, 2);
    assert.deepEqual(p.entities.find(e => e.id === 'a')!.position, [1, 0, 0]);
});
test('failed group edits roll back the batch; removing a group retains members', () => {
    const p = fixture(); p.entities.find(e => e.id === 'b')!.locked = true; const saved = clone(p);
    assert.throws(() => applyOperations(p, [{ operation: 'group', id: 'g', name: '改名', patch: { action: 'rename' } }, { operation: 'group', id: 'g', patch: { action: 'transform', translation: [1, 0, 0] } }]), /锁定/);
    assert.deepEqual(p, saved);
    const ungrouped = applyOperations(p, [{ operation: 'group', id: 'g', patch: { action: 'remove' } }]);
    assert.deepEqual(ungrouped.entities, p.entities); assert.equal(ungrouped.groups!.length, 0);
    assert.equal(changeSummary(p, ungrouped).projectChanged, true);
});
test('group copies remap internal bindings and clip IDs, preserve originals and independent edits', () => {
    const p = fixture(), a = p.entities.find(e => e.id === 'a')!, b = p.entities.find(e => e.id === 'b')!;
    a.clips = [{ id: 'clip-a', action: 'walk', start: 0, end: 2, speed: 1 }];
    b.handBinding = { actorId: a.id, hand: 'right', offset: [0, 0, 0], rotation: [0, 0, 0] };
    const next = applyOperations(p, [{ operation: 'group', id: 'g', patch: { action: 'duplicate', newId: 'g2', translation: [5, 0, 0] } }]);
    const copies = next.entities.filter(e => next.groups![1].entityIds.includes(e.id)), person = copies.find(e => e.kind === 'actor')!, prop = copies.find(e => e.kind === 'prop')!;
    assert.equal(prop.handBinding!.actorId, person.id); assert.notEqual(person.clips[0].id, a.clips[0].id);
    assert.deepEqual(person.path!.points[0].position, [6, 0, 0]); assert.deepEqual(prop.handBinding!.offset, b.handBinding.offset);
    person.path!.points[0].position[0] = 99; assert.equal(next.entities.find(e => e.id === 'a')!.path!.points[0].position[0], 1);
    assert.deepEqual(next.cuts, p.cuts);
    assert.throws(() => transformEntities(p, ['a'], { translation: [1, 0, 0] }), /关联对象/);
});
test('deletion cleans membership and scene insertion remaps groups without collisions', () => {
    const p = fixture(), next = applyOperations(p, [{ operation: 'remove', id: 'b' }]);
    assert.deepEqual(next.groups![0].entityIds, ['a']);
    const empty = applyOperations(next, [{ operation: 'remove', id: 'a' }]); assert.deepEqual(empty.groups, []);
    const merged = mergeScene(p, p, { offset: [10, 0, 0], timeOffset: 0, scheduling: 'keep', cuts: 'keep' });
    assert.equal(merged.project.groups!.length, 2); assert.notEqual(merged.project.groups![0].id, merged.project.groups![1].id);
    assert.deepEqual(merged.project.groups![1].entityIds, ['a', 'b'].map(id => merged.entityIds[id]));
});
test('MCP accepts the common group operation and rejects unknown operations', () => {
    validateToolInput('director_apply', { revision: 1, requestId: 'group', operations: [{ operation: 'group', id: 'g', patch: { action: 'transform', translation: [1, 0, 0] } }] });
    assert.throws(() => applyOperations(fixture(), [{ operation: 'group', id: 'g', patch: { action: 'transform', translation: [NaN, 0, 0] } }]), /有限数字/);
});
test('drag inputs are absolute, preserve path times and keep recorded yaw through a half turn', () => {
    const p = fixture(), a = p.entities.find(e => e.id === 'a')!;
    a.path!.points.forEach(point => point.heading = .25);
    const drag = beginGroupDrag(p, ['a', 'b'], [0, 0, 0]);
    drag.apply('translate', [1, 0, 0], [0, 0, 0]); drag.apply('translate', [2, 0, 0], [0, 0, 0]);
    assert.deepEqual(a.position, [3, 0, 0]);
    drag.apply('rotate', [0, 0, 0], [0, Math.PI, 0]);
    assert.ok(Math.abs(entityYaw(a, 1, p) - Math.PI - .25) < 1e-8);
    assert.deepEqual(a.path!.points.map(point => point.time), [0, 2]);
});
test('connected modules transform exactly once and locked downstream membership blocks before mutation', () => {
    const p = createScene('blank'), a = entity('prop', 'road', '路段 A'), b = entity('prop', 'road', '路段 B');
    b.structureLink = { parentId: a.id, parentPort: 'out', ownPort: 'in', offset: [0, 0, 0], rotation: [0, 0, 0] };
    p.entities.push(a, b); syncStructureLinks(p); const original = clone(p);
    transformEntities(p, [a.id, b.id], { translation: [3, 1, -2], rotation: [0, Math.PI / 2, 0], pivot: [0, 0, 0] }); assertProject(p);
    for (const id of [a.id, b.id]) {
        const expected = new Vector3(...original.entities.find(e => e.id === id)!.position).applyAxisAngle(new Vector3(0, 1, 0), Math.PI / 2).add(new Vector3(3, 1, -2));
        assert.ok(new Vector3(...p.entities.find(e => e.id === id)!.position).distanceTo(expected) < 1e-8);
    }
    b.locked = true; const before = clone(p);
    assert.throws(() => transformEntities(p, [a.id, b.id], { translation: [1, 0, 0] }), /锁定/); assert.deepEqual(p, before);
});

test('group rotation drag keeps physics vectors relative to the gesture start', () => {
    const p=fixture(),a=p.entities.find(e=>e.id==='a')!;
    a.physics={...defaultPhysicsBody(),velocity:[1,2,3],angularVelocity:[3,2,1],impulses:[{time:1,impulse:[4,5,6],point:[1,0,2]}]};
    const expected=clone(p),drag=beginGroupDrag(p,['a','b'],[0,0,0]);
    transformEntities(expected,['a','b'],{rotation:[0,Math.PI/2,0],pivot:[0,0,0]});
    drag.apply('rotate',[0,0,0],[0,Math.PI/4,0]);
    drag.apply('rotate',[0,0,0],[0,Math.PI/2,0]);
    assert.deepEqual(a.physics,expected.entities.find(e=>e.id==='a')!.physics);
    drag.apply('rotate',[0,0,0],[0,Math.PI/2,0]);
    assert.deepEqual(a.physics,expected.entities.find(e=>e.id==='a')!.physics);
    assertProject(p);
});
