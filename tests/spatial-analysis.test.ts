import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Vector3 } from 'three';
import { sampleVisibility } from '../src/spatial/visibility.ts';
import { collectSpatialReport } from '../src/spatial/report.ts';
import { framingSummary } from '../src/spatial/framing-summary.ts';
import { createToolService } from '../src/automation/service.ts';
import type { AppContext } from '../src/app-context.ts';
import type { SceneTarget } from '../src/spatial/scene-targets.ts';
import { pathCheckTimes, rangeSampleTimes, scanSpatialRange, sweptBoxOverlap } from '../src/spatial/range.ts';
import { createScene } from '../src/scenes.ts';
import { entity } from '../src/model.ts';
import type { Engine } from '../src/engine.ts';
const box = (x: number, y = 0, z = 0) => new Box3(new Vector3(x - .3, y, z - .3), new Vector3(x + .3, y + 1.7, z + .3));
test('swept boxes detect fast crossings between disjoint endpoints, respect height and support contact', () => {
    const crossing = sweptBoxOverlap(box(-2), box(2), box(0), box(0));
    assert.ok(crossing && crossing[0] > .3 && crossing[1] < .7);
    assert.equal(sweptBoxOverlap(box(-2, 3), box(2, 3), box(0), box(0)), null);
    assert.equal(sweptBoxOverlap(box(0), box(0), new Box3(new Vector3(-10, -1, -10), new Vector3(10, 0, 10)), new Box3(new Vector3(-10, -1, -10), new Vector3(10, 0, 10))), null);
    assert.ok(sweptBoxOverlap(box(-2), box(2), box(2), box(-2)));
});
test('range sampling includes endpoints and critical times, rejects invalid or excessive ranges', () => {
    assert.deepEqual(rangeSampleTimes(1, 2, 2, [.5, 1.25, 2, 3]), [1, 1.25, 1.5, 2]);
    assert.throws(() => rangeSampleTimes(1, 0, 24)); assert.throws(() => rangeSampleTimes(0, 1, NaN));
    assert.throws(() => rangeSampleTimes(0, 1000, 120));
});
test('trimmed and retimed paths include internal waypoints at their playback times', () => {
    const times = pathCheckTimes({ smooth: false, points: [0, 2, 5, 10].map(time => ({ time, position: [time, 0, 0] })),
        sections: [{ start: 20, end: 24, from: 1, to: 5 }, { start: 30, end: 40, from: 5, to: 10 }] });
    assert.deepEqual(times, [20, 24, 21, 30, 40]);
    assert.deepEqual(rangeSampleTimes(20, 24, 1, times), [20, 21, 22, 23, 24]);
});
test('visibility raycasts distinguish clear, blocked, partially blocked and behind-target geometry', () => {
    const camera = new PerspectiveCamera(50, 16 / 9, .1, 100); camera.position.set(0, 1, 5); camera.lookAt(0, 1, 0); camera.updateMatrixWorld(true);
    function target(key: string, width: number, x: number, z: number): SceneTarget {
        const root = new Mesh(new BoxGeometry(width, 2, .2), new MeshBasicMaterial()); root.position.set(x, 1, z); root.updateMatrixWorld(true);
        return { key, name: key, entityId: key, root, meshes: [root], person: false };
    }
    const person = target('person', 1, 0, 0), wall = target('wall', 3, 0, 2);
    assert.equal(sampleVisibility(camera, person.meshes, [person]).status, 'unblocked-samples');
    const blocked = sampleVisibility(camera, person.meshes, [person, wall]);
    assert.equal(blocked.status, 'blocked-samples'); assert.equal(blocked.blockers[0].key, 'wall'); assert.ok(blocked.targetSamples > 0);
    wall.root.position.z = -2; wall.root.updateMatrixWorld(true);
    assert.equal(sampleVisibility(camera, person.meshes, [person, wall]).status, 'unblocked-samples');
    const partial = target('partial', .5, .3, 2);
    assert.equal(sampleVisibility(camera, person.meshes, [person, partial]).status, 'partly-blocked-samples');
    person.root.position.z = 10; person.root.updateMatrixWorld(true);
    assert.equal(sampleVisibility(camera, person.meshes, [person, wall]).status, 'out-of-frame');
});

function reportFixture() {
    const project = createScene('blank');
    const camera = project.entities.find(e => e.kind === 'camera')!;
    const subject = entity('actor', 'person', '人物', [0, 1, 0]);
    const screen = entity('prop', 'cube', '遮挡板', [0, 1, 2]);
    const background = entity('prop', 'chair', '背景座椅', [8, 1, 0]);
    project.entities = [camera, subject, screen, background];
    const shot = new PerspectiveCamera(50, 16 / 9, .1, 100);
    shot.position.set(0, 1, 5); shot.lookAt(0, 1, 0); shot.updateMatrixWorld(true);
    const models = new Map([subject, screen, background].map(e => {
        const mesh = new Mesh(new BoxGeometry(e === screen ? 3 : 1, 2, .2), new MeshBasicMaterial());
        mesh.position.fromArray(e.position); mesh.updateMatrixWorld(true);
        return [e.id, mesh];
    }));
    const detailed: string[] = [];
    let time = .25;
    const engine = {
        project, get time() { return time; }, models, cameras: new Map([[camera.id, shot]]), rigs: new Map(), crowdRigs: new Map(), walls: new Map(), roomGroup: new Group(),
        cameraEntity: () => camera, getShotCamera: () => shot,
        sample(at: number) { time = at; },
        externalModels: { humanContactState(id: string) { detailed.push(id); }, humanPlantState() {}, motionTransitionState() {} },
    } as unknown as Engine;
    return { engine, project, camera, subject, screen, background, models, detailed };
}

test('focused reports build only requested object details while global blockers and counts remain accurate', () => {
    const { engine, camera, subject, screen, detailed } = reportFixture();
    const key = `entity:${subject.id}`, blocker = `entity:${screen.id}`;
    const occlusionKeys = [key, blocker];
    const full = collectSpatialReport(engine, camera.id, { occlusionKeys });
    detailed.length = 0;
    const focused = collectSpatialReport(engine, camera.id, { ids: [subject.id], occlusionKeys });
    assert.deepEqual(focused.objects, full.objects.filter(o => o.entityId === subject.id));
    assert.equal(focused.objects[0].visibility?.body.blockers[0].key, blocker);
    assert.deepEqual(focused.counts, full.counts);
    assert.deepEqual(detailed, [subject.id]);
    assert.throws(() => collectSpatialReport(engine, camera.id, { ids: [], occlusionKeys: ['entity:missing'] }), /遮挡查询对象不存在/);
});

test('framing summaries preserve exact framing and identify the main sampled blocker', () => {
    const { engine, camera, subject, screen } = reportFixture();
    const full = collectSpatialReport(engine, camera.id, { ids: [subject.id], occlusionKeys: [`entity:${subject.id}`] });
    const compact = framingSummary(full);
    assert.deepEqual(compact.camera, { id: camera.id, name: camera.name });
    assert.deepEqual(compact.objects[0].framing, full.objects[0].framing);
    assert.equal(compact.objects[0].visibility?.body.status, full.objects[0].visibility?.body.status);
    assert.deepEqual(compact.objects[0].visibility?.body.blocker, { key: `entity:${screen.id}`, name: screen.name });
    assert.ok(Buffer.byteLength(JSON.stringify(compact)) < Buffer.byteLength(JSON.stringify(full)) / 3);
    const unsampled = framingSummary(collectSpatialReport(engine, camera.id, { ids: [subject.id] }));
    assert.equal(unsampled.objects[0].visibility, undefined);
    assert.equal(unsampled.objects[0].framing.occlusion, 'not-checked');
});

test('a job wait reports its blocking task and permits read/cancel while running', { timeout: 3000 }, async () => {
    const { engine, project, camera, subject } = reportFixture();
    const ctx = { project, engine, preview: camera.id, time: engine.time, history: { pending: false }, busy: false, updateTimeUI() {} } as unknown as AppContext;
    const service = createToolService(ctx);
    const scan = await service.call('director_scan', { start: 0, end: 3, sampleFps: 120, cameraId: camera.id, targetKey: `entity:${subject.id}` });
    assert.equal(scan.ok, true, scan.error ?? 'scan failed to start');
    const id = scan.data.jobId;
    const waiting = service.call('director_job', { id, waitMs: 1500 });
    const busy = await service.call('director_spatial', { ids: [subject.id] });
    assert.equal(busy.code, 'EDITOR_BUSY');
    assert.deepEqual(busy.job, { id, tool: 'director_scan', status: 'running' });
    assert.equal((await service.call('director_read', { sections: [] })).ok, true);
    assert.equal((await service.call('director_job', { id, cancel: true })).ok, true);
    const stopped = await waiting;
    assert.equal(stopped.ok, true, stopped.error ?? 'job wait failed');
    assert.equal(stopped.data.status, 'canceled');
    assert.equal(ctx.busy, false);
    assert.equal(engine.time, .25);
});

test('range comparison samples selected participants and detects in-place source edits', async () => {
    const { engine, project, camera, subject, screen, background, models } = reportFixture();
    project.media = [{ id: 'fixture', name: '测试媒体', mime: 'image/png', data: 'data:image/png;base64,QUJD', width: 1, height: 1 } as NonNullable<typeof project.media>[number]];
    const options = { start: 0, end: 1, sampleFps: 1, targetKey: `entity:${subject.id}`, compareKey: `entity:${screen.id}`, cameraId: camera.id };
    const result = await scanSpatialRange(engine, options);
    assert.equal(result.complete, true);
    assert.ok(models.get(subject.id)!.geometry.boundingBox);
    assert.equal(models.get(background.id)!.geometry.boundingBox, null);
    assert.equal(engine.time, .25);
    await assert.rejects(scanSpatialRange(engine, options, undefined, () => { project.media![0].data += 'WA=='; }), /检查期间工程发生修改/);
    assert.equal(engine.time, .25);
});
