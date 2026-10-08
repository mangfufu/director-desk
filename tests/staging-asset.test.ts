import test from 'node:test';
import assert from 'node:assert/strict';
import { createScene } from '../src/scenes.ts';
import { entity, assertProject, clone } from '../src/model.ts';
import { createStagingAsset, insertStagingAsset, assertStagingAsset, stagingMetadata } from '../src/building/staging-asset.ts';
import { defaultSurfaceLayer } from '../src/media/model.ts';
import { packModelFiles } from '../src/resources/model-package.ts';
import { modelResourceId } from '../src/resources/project-resources.ts';

test('partial staging includes only selected objects/dependencies; support camera never enters destination', () => {
    const p = createScene('blank'), actor = entity('actor', 'person', '持有者', [10, 0, 0]), held = entity('prop', 'cup', '杯子');
    held.handBinding = { actorId: actor.id, hand: 'right', offset: [.1, 0, 0], rotation: [0, 0, 0] };
    p.entities.push(actor, held); p.groups = [{ id: 'g', name: '组合', entityIds: [actor.id, held.id] }];
    p.production = { fixedPrompt: '不属于布景的剧情', sceneReferenceIds: [], notes: [], promptText: '不应导出' };
    const before = clone(p), asset = createStagingAsset(p, [held.id], '杯子和持有者');
    assert.deepEqual(new Set(asset.entityIds), new Set([actor.id, held.id])); assert.equal(asset.scene.production, undefined); assert.equal(asset.scene.room.enabled, false); assert.deepEqual(p, before);
    const dest = createScene('blank'), inserted = insertStagingAsset(dest, asset, [5, 0, 0]);
    assert.equal(inserted.addedIds.length, 2); assert.equal(inserted.project.entities.length, dest.entities.length + 2);
    assert.equal(inserted.project.entities.filter(e => e.camera).length, dest.entities.filter(e => e.camera).length);
    assert.equal(inserted.project.entities.find(e => e.id === inserted.entityIds[held.id])!.handBinding!.actorId, inserted.entityIds[actor.id]);
    assert.deepEqual(inserted.project.cuts, dest.cuts); assertProject(inserted.project);
    assert.ok(!JSON.stringify(stagingMetadata(asset)).includes('不应导出'));
});
test('model/media sources stay portable, unused resources are excluded and repeated insertion reuses sources', async () => {
    const p = createScene('blank'); p.version = 2;
    const pkg = packModelFiles('test.obj', [{ path: 'test.obj', bytes: new TextEncoder().encode('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n') }]);
    const resource = { id: await modelResourceId(pkg), name: '测试', package: pkg, copyright: '', license: 'CC0', source: '' };
    p.resources = [resource];
    p.media = [{ id: 'media-' + 'a'.repeat(64), name: '贴图', mime: 'image/png', data: 'data:image/png;base64,aGVsbG8=', width: 2, height: 2, duration: 0 }];
    const prop = entity('prop', 'external-model', '模型'); prop.external = { resourceId: resource.id, appearance: 'original', unitScale: 1, orientation: [0, 0, 0] }; prop.surface = { layers: [defaultSurfaceLayer(p.media[0].id)] }; p.entities.push(prop);
    const asset = createStagingAsset(p, [prop.id], '可携带布景'); assertStagingAsset(JSON.parse(JSON.stringify(asset)));
    assert.equal(asset.scene.resources!.length, 1); assert.equal(asset.scene.media!.length, 1);
    const first = insertStagingAsset(createScene('blank'), asset), second = insertStagingAsset(first.project, asset, [3, 0, 0]);
    assert.equal(second.project.resources!.length, 1); assert.equal(second.project.media!.length, 1); assert.notEqual(first.addedIds[0], second.addedIds[0]);
    const unrelated = createStagingAsset(p, [p.entities.find(e => e.asset === 'ground')!.id], '地面'); assert.equal(unrelated.scene.resources!.length, 0); assert.equal(unrelated.scene.media!.length, 0);
});
test('malformed membership cannot hide unrelated payload objects, while static inserts preserve target duration', () => {
    const p = createScene('blank'), prop = entity('prop', 'cube', '方块'); p.entities.push(prop);
    const asset = createStagingAsset(p, [prop.id], '方块'), bad = clone(asset); bad.entityIds = ['missing']; assert.throws(() => assertStagingAsset(bad));
    const helperGroup = clone(asset); helperGroup.scene.groups = [{ id: 'bad-group', name: '辅助机位', entityIds: [asset.supportCameraId!] }];
    assert.throws(() => assertStagingAsset(helperGroup), /辅助机位/);
    const dest = createScene('blank'); dest.duration = 2;
    assert.equal(insertStagingAsset(dest, asset).project.duration, 2);
    const object = asset.scene.entities.find(e => e.id === prop.id)!; object.path = { smooth: false, points: [{ time: 0, position: [0, 0, 0] }, { time: 4, position: [1, 0, 0] }] };
    assert.equal(insertStagingAsset(dest, asset).project.duration, 4);
});
