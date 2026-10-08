import test from 'node:test';
import assert from 'node:assert/strict';
import { clone, entity, assertProject } from '../src/model.ts';
import { createScene } from '../src/scenes.ts';
import { arrangeEntities } from '../src/building/arrangement.ts';
import { applyOperations } from '../src/automation/edits.ts';
import { makeProp } from '../src/assets/props.ts';
import { geometryBounds } from '../src/spatial/geometry.ts';
import { disposeTree } from '../src/assets/dispose.ts';
import { syncStructureLinks } from '../src/building/structure-links.ts';

function fixture() {
    const p = createScene('blank');
    for (let i = 0; i < 3; i++) { const e = entity('prop', 'cube', `方块 ${i}`, [i * i * 3, 0, i]); e.id = `p${i}`; e.rotation[1] = i * .2; e.scale = [i + 1, 1, 1]; p.entities.push(e); }
    return p;
}
function measure(p: ReturnType<typeof fixture>) {
    return Object.fromEntries(p.entities.filter(e => /^p\d$/.test(e.id)).map(e => {
        const root = makeProp(e); root.position.fromArray(e.position); root.rotation.set(...e.rotation); root.scale.fromArray(e.scale);
        try { const box = geometryBounds(root)!; return [e.id, { min: box.min.toArray(), max: box.max.toArray() }]; } finally { disposeTree(root); }
    }));
}
test('alignment uses the rotated and scaled geometric boundary and preserves source/anchor', () => {
    const p = fixture(), before = clone(p), bounds = measure(p);
    const next = arrangeEntities(p, { action: 'align', entityIds: ['p0', 'p1', 'p2'], axis: 'x', alignment: 'min', anchorId: 'p1', bounds });
    const after = measure(next); assert.ok(Object.values(after).every(b => Math.abs(b.min[0] - bounds.p1.min[0]) < 1e-7));
    assert.deepEqual(p, before); assert.deepEqual(next.entities.find(e => e.id === 'p1'), before.entities.find(e => e.id === 'p1')); assertProject(next);
});
test('distribution keeps endpoints and spaces centres; locks roll back the entire batch', () => {
    const p = fixture(), bounds = measure(p);
    const next = arrangeEntities(p, { action: 'distribute', entityIds: ['p2', 'p0', 'p1'], bounds });
    assert.equal(next.entities.find(e => e.id === 'p1')!.position[0], 6);
    p.entities.find(e => e.id === 'p1')!.locked = true;
    assert.throws(() => arrangeEntities(p, { action: 'align', entityIds: ['p0', 'p1'], bounds }), /锁定/);
    assert.deepEqual(p.entities.find(e => e.id === 'p0')!.position, [0, 0, 0]);
});
test('line/grid/circle arrays preserve independent groups and do not copy camera cuts', () => {
    const p = fixture(); p.groups = [{ id: 'g', name: '组合', entityIds: ['p0', 'p1'] }];
    const next = applyOperations(p, [{ operation: 'arrange', patch: { action: 'array', entityIds: ['p0', 'p1'], shape: 'grid', count: 5, columns: 2, step: [3, 0, 0], rowStep: [0, 0, 4] } }]);
    assert.equal(next.groups!.length, 5); assert.equal(next.entities.length, p.entities.length + 8);
    const last = next.entities.find(e => e.id === next.groups![4].entityIds[0])!; assert.deepEqual(last.position, [0, 0, 8]);
    last.position[0] = 77; assert.equal(next.entities.find(e => e.id === 'p0')!.position[0], 0); assert.deepEqual(next.cuts, p.cuts);
    const circle = arrangeEntities(p, { action: 'array', entityIds: ['p0'], shape: 'circle', count: 4, radius: 2, rotate: true });
    const ring = circle.entities.slice(p.entities.length); assert.ok(Math.abs(ring[0].position[0] + 2) < 1e-8); assert.ok(Math.abs(ring[0].position[2] + 2) < 1e-8);
    assertProject(circle);
});
test('missing real bounds and invalid array sizes are rejected', () => {
    const p = fixture();
    assert.throws(() => arrangeEntities(p, { action: 'align', entityIds: ['p0', 'p1'] }), /实际边界/);
    assert.throws(() => arrangeEntities(p, { action: 'array', entityIds: ['p0'], count: 1.5 }), /阵列需要/);
});

test('batch arrays retain independent module links and leave source connections untouched', () => {
    const p = createScene('blank'), a = entity('prop', 'road', 'A'), b = entity('prop', 'road', 'B');
    b.structureLink = { parentId: a.id, parentPort: 'out', ownPort: 'in', offset: [0, 0, 0], rotation: [0, 0, 0] };
    p.entities.push(a, b); syncStructureLinks(p); const before = clone(p);
    const result = arrangeEntities(p, { action: 'array', entityIds: [a.id, b.id], shape: 'circle', count: 12, radius: 20, rotate: true });
    assertProject(result); assert.deepEqual(p, before);
    const copies = result.entities.slice(p.entities.length);
    for (let i = 0; i < copies.length; i += 2) assert.equal(copies[i + 1].structureLink!.parentId, copies[i].id);
});
