import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createRequire } from 'node:module';
import { demoProject, entity, type ProductionData } from '../src/model.ts';
import type { AppContext } from '../src/app-context.ts';
import { createToolService } from '../src/automation/service.ts';
import { applyOperations } from '../src/automation/edits.ts';
import { validateToolInput } from '../src/automation/validate.ts';
import { MCP_TOOL_DEFINITIONS, TOOL_DEFINITIONS } from '../src/automation/contract.ts';
import { readIndependentScene } from '../src/scenes/scene-query.ts';
import { readSceneDocument } from '../src/scenes/sequence-project.ts';

function fixture() {
    const project = demoProject();
    project.production = { fixedPrompt: '保留风格', sceneReferenceIds: [], notes: [], promptText: '完整成稿'.repeat(2000) };
    const ctx = { project, revision: 0, time: 0, preview: 'program', selected: project.entities[0].id,
        // Accidental eager inspection must fail even when the returned payload later omits it.
        get engine() { throw Error('unrequested engine inspection'); },
    } as unknown as AppContext;
    return { ctx, service: createToolService(ctx) };
}

test('default and selected detailed reads omit unrequested production and global data before computing', async () => {
    const { ctx, service } = fixture();
    const original = JSON.stringify(ctx.project);
    const base = await service.call('director_read'); assert.equal(base.ok, true, base.error ?? 'read failed');
    const selected = await service.call('director_read', { ids: [ctx.project.entities[0].id, 'missing'], details: true });
    assert.equal(selected.ok, true, selected.error ?? 'read failed');
    const data = selected.data as Record<string, any>;
    assert.deepEqual(data.sections, ['entities']); assert.equal(data.entities.length, 1);
    assert.deepEqual(data.entities[0].rotation, ctx.project.entities[0].rotation);
    assert.deepEqual(data.missingIds, ['missing']);
    for (const key of ['production', 'cuts', 'room', 'resources', 'media', 'resourceStatistics', 'mediaRuntime', 'selection', 'geometry']) assert.equal(Object.hasOwn(data, key), false, key);
    assert.equal(data.revision, (base.data as any).revision);
    assert.equal(data.duration, ctx.project.duration);
    assert.equal(JSON.stringify(ctx.project), original);
});

test('only requested partitions return; complete production safely round-trips notes edits without erasing the saved prompt', async () => {
    const { ctx, service } = fixture();
    const result = await service.call('director_read', { sections: ['production', 'cuts'] });
    assert.equal(result.ok, true, result.error ?? 'read failed');
    const data = result.data as { production: ProductionData; cuts: unknown; entities?: unknown };
    assert.deepEqual(data.production, ctx.project.production); assert.deepEqual(data.cuts, ctx.project.cuts);
    assert.equal(Object.hasOwn(data, 'entities'), false);
    data.production.fixedPrompt = '调整风格';
    assert.equal(ctx.project.production!.fixedPrompt, '保留风格', 'read payload does not mutate stored notes');
    const changed = applyOperations(ctx.project, [{ operation: 'notes', value: data.production }]);
    assert.equal(changed.production!.fixedPrompt, '调整风格');
    assert.equal(changed.production!.promptText, ctx.project.production!.promptText);
    assert.deepEqual(changed.production!.sceneReferenceIds, ctx.project.production!.sceneReferenceIds);
});

test('metadata-only, scene, resources and empty selection keep distinct omission semantics', async () => {
    const { ctx, service } = fixture();
    const core = await service.call('director_read', { sections: [] });
    assert.equal(core.ok, true, core.error ?? 'read failed'); assert.equal(Object.hasOwn(core.data!, 'entities'), false);
    assert.equal(Object.hasOwn(core.data!, 'selection'), false);
    assert.equal(Object.hasOwn(core.data!, 'geometry'), false);
    const empty = await service.call('director_read', { ids: [] });
    assert.deepEqual((empty.data as any).entities, []);
    const scene = await service.call('director_read', { sections: ['scene', 'resources', 'references'] });
    assert.equal(scene.ok, true, scene.error ?? 'read failed');
    assert.deepEqual((scene.data as any).room, ctx.project.room);
    assert.equal(Object.hasOwn(scene.data!, 'production'), false);
    assert.equal(Object.hasOwn(scene.data!, 'resources'), true);
    const selection = await service.call('director_read', { sections: ['selection'] });
    assert.equal(selection.ok, true, selection.error ?? 'selection read failed');
    assert.equal(Object.hasOwn(selection.data!, 'selection'), true);
    assert.equal(Object.hasOwn(selection.data!, 'entities'), false);
    ctx.project.creationMode = 'geometry';
    const geometry = await service.call('director_read', { sections: [] });
    assert.equal(geometry.ok, true, geometry.error ?? 'geometry read failed');
    assert.equal(Object.hasOwn(geometry.data!, 'geometry'), true);
    assert.equal(Object.hasOwn(geometry.data!, 'selection'), false);
    const missing = await service.call('director_read', { resourceId: 'missing' });
    assert.equal(missing.ok, false); assert.match(missing.error!, /模型资源不存在/);
});

test('all is explicit and statistics run only when selected, independently of entity detail', async () => {
    const { ctx, service } = fixture(); let statisticsCalls = 0;
    const renderer = { info: { render: { frame: 1, calls: 1, triangles: 0 }, memory: { geometries: 0, textures: 0 } } };
    Object.defineProperty(ctx, 'engine', { value: { project: ctx.project, models: new Map(), roomGroup: new T.Group(),
        editorRenderer: renderer, shotRenderer: renderer, surfaces: { textures: { statistics() { statisticsCalls++; return { active: 0 }; } } } } });
    const all = await service.call('director_read', { sections: ['all'], details: true });
    assert.equal(all.ok, true, all.error ?? 'read failed');
    for (const key of ['entities', 'production', 'cuts', 'room', 'resources', 'media', 'resourceUsage', 'resourceStatistics', 'mediaRuntime']) assert.equal(Object.hasOwn(all.data!, key), true, key);
    assert.equal(statisticsCalls, 1);
    const stats = await service.call('director_read', { sections: ['statistics'] });
    assert.equal(stats.ok, true, stats.error ?? 'read failed'); assert.equal(statisticsCalls, 2);
    assert.equal(Object.hasOwn(stats.data!, 'entities'), false);
});

test('MCP and built-in assistant use the same validated section selector', () => {
    assert.deepEqual(MCP_TOOL_DEFINITIONS, TOOL_DEFINITIONS);
    validateToolInput('director_read', { sections: [] });
    validateToolInput('director_read', { sections: ['production', 'cuts'] });
    assert.throws(() => validateToolInput('director_read', { sections: ['typo'] }), /sections/);
    assert.throws(() => validateToolInput('director_read', { sections: 'all' }), /sections/);
});

test('large reads default to category counts and exact lookups reuse the current index', async () => {
    const { ctx, service } = fixture();
    const small = (await service.call('director_read', { overview: true })).data!;
    assert.equal(small.entities.length, ctx.project.entities.length);

    const door = { ...entity('prop', 'structure-doorframe', '东侧门框'), id: 'east-door' };
    const chairs = Array.from({ length: 40 }, (_, i) => entity('prop', 'chair', i === 39 ? '东侧门框' : '椅子 ' + i));
    let unrelatedReads = 0;
    Object.defineProperty(chairs[0], 'asset', { get() { unrelatedReads++; return 'chair'; } });
    ctx.project.entities.push(...chairs, door);
    const overview = (await service.call('director_read')).data!;
    assert.equal(Object.hasOwn(overview, 'entities'), false);
    assert.equal(overview.entityCount, ctx.project.entities.length);
    assert.ok(overview.entityCategories.some((item: { category: string, count: number }) => item.category === '家具' && item.count >= 40));
    assert.equal(overview.entityCategories.reduce((sum: number, item: { count: number }) => sum + item.count, 0), overview.entityCount);
    const afterOverview = unrelatedReads;
    const lookup = { category: '建筑构件', entityName: ' 东侧门框 ' };
    const result = (await service.call('director_read', lookup)).data!;
    assert.deepEqual(result.entities.map((e: { id: string }) => e.id), [door.id]);
    assert.deepEqual((await service.call('director_read', { entityName: lookup.entityName })).data!.entities.map((e: { id: string }) => e.id), [chairs[39].id, door.id]);
    assert.deepEqual((await service.call('director_read', { ids: [door.id, 'missing', chairs[39].id, door.id] })).data!.entities.map((e: { id: string }) => e.id), [chairs[39].id, door.id]);
    assert.equal(unrelatedReads, afterOverview);
    const firstPage = (await service.call('director_read', { overview: false })).data!;
    assert.equal(firstPage.entities.length, 32);
    assert.equal(firstPage.entityPage.nextOffset, 32);
    const detailed = (await service.call('director_read', { details: true })).data!;
    assert.equal(detailed.entities.length, 32);
    assert.equal(detailed.entityPage.total, overview.entityCount);
    const doc = readSceneDocument(ctx.project), saved = readIndependentScene(doc).project;
    assert.equal(saved.entities, undefined);
    assert.deepEqual(saved.entityCategories, overview.entityCategories);
    assert.equal(readIndependentScene(doc, undefined, { sections: ['all'] }).project.entities?.length, overview.entityCount);
    door.name = '东门框';
    door.asset = 'cube';
    Object.assign(ctx, { revision: ctx.revision + 1 });
    assert.deepEqual((await service.call('director_read', lookup)).data!.entities, []);
    const moved = (await service.call('director_read', { category: '搭建', entityName: door.name })).data!;
    assert.deepEqual(moved.entities.map((e: { id: string }) => e.id), [door.id]);
});

test('real MCP HTTP advertises object filters, reads matching pages and retains existing section behavior', async () => {
    const { ctx, service } = fixture();
    ctx.project.entities.push(
        { ...entity('prop', 'cube', 'Gallery Entrance'), id: 'door-a' },
        { ...entity('prop', 'cube', 'Gallery Exit'), id: 'door-b' },
        { ...entity('camera', 'camera', 'Gallery Camera'), id: 'gallery-camera' },
    );
    const { startMcp } = createRequire(import.meta.url)('../desktop/mcp-server.cjs');
    const server = await startMcp(MCP_TOOL_DEFINITIONS, service.call, '0.0.0-test', { port: 0, token: 'local-test-only' });
    let id = 0;
    const request = async (method: string, params: unknown) => {
        const response = await fetch(server.url, { method: 'POST', headers: { authorization: 'Bearer local-test-only',
            'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) });
        assert.equal(response.status, 200);
        return (await response.json()).result;
    };
    try {
        const list = await request('tools/list', {});
        const schema = list.tools.find((t: any) => t.name === 'director_read').inputSchema.properties;
        for (const key of ['sections', 'query', 'entityName', 'kind', 'category', 'overview', 'offset', 'limit']) assert.ok(schema[key], key);
        assert.ok(list.tools.find((t: any) => t.name === 'director_help').inputSchema.properties.topic.enum.includes('camera'));
        const help = await request('tools/call', { name: 'director_help', arguments: { topic: 'camera' } });
        assert.equal(help.isError, false);
        const guide = JSON.parse(help.content[0].text).data;
        assert.equal(guide.guide.path, 'references/camera.md');
        assert.deepEqual(guide.tools, []);
        for (const sections of [['entities'], ['production']]) {
            const response = await request('tools/call', { name: 'director_read', arguments: { sections } });
            assert.equal(response.isError, false); assert.equal(response.content.length, 1);
            const result = JSON.parse(response.content[0].text);
            assert.equal(result.ok, true); assert.deepEqual(result.data.sections, sections);
            assert.equal(Object.hasOwn(result.data, 'production'), sections[0] === 'production');
            assert.equal(Object.hasOwn(result.data, 'entities'), sections[0] === 'entities');
        }
        const read = async (args: unknown) => {
            const raw = await request('tools/call', { name: 'director_read', arguments: args });
            return JSON.parse(raw.content[0].text);
        };
        const query = { query: ' GALLERY ', kind: 'prop', category: '搭建', limit: 1, details: true };
        const first = await read(query);
        assert.equal(first.ok, true);
        assert.deepEqual(first.data.entities.map((e: { id: string }) => e.id), ['door-a']);
        assert.deepEqual(first.data.entities[0].rotation, [0, 0, 0]);
        assert.deepEqual(first.data.entityPage, { total: 2, offset: 0, limit: 1, nextOffset: 1 });
        assert.equal(first.data.entityCount, ctx.project.entities.length);
        const second = await read({ ...query, offset: first.data.entityPage.nextOffset });
        assert.deepEqual(second.data.entities.map((e: { id: string }) => e.id), ['door-b']);
        assert.equal(second.data.entityPage.nextOffset, null);
        assert.equal(second.data.revision, first.data.revision);
        const none = await read({ query: 'missing door' });
        assert.deepEqual(none.data.entities, []);
        assert.equal(none.data.entityPage.total, 0);
        const ids = await read({ ...query, ids: ['door-a', 'gallery-camera', 'missing-id'] });
        assert.deepEqual(ids.data.missingIds, ['missing-id']);
        assert.equal(ids.data.entityPage.total, 1);
        const exact = await read({ category: '搭建', entityName: ' GALLERY ENTRANCE ' });
        assert.deepEqual(exact.data.entities.map((e: { id: string }) => e.id), ['door-a']);
        assert.match((await read({ limit: 101 })).error, /limit/);
        assert.match((await read({ offset: 0.5 })).error, /offset/);
    } finally { await server.close(); }
});
