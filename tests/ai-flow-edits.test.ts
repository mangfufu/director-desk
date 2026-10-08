import test from 'node:test';
import assert from 'node:assert/strict';
import { demoProject } from '../src/model.ts';
import { applyOperations } from '../src/automation/edits.ts';
import { readSceneDocument, duplicateDocumentScene } from '../src/scenes/sequence-project.ts';
import { SceneSession } from '../src/scenes/sequence-session.ts';
import { createToolService } from '../src/automation/service.ts';
import type { AppContext } from '../src/app-context.ts';
import { validateToolInput } from '../src/automation/validate.ts';

test('production patch retains the other draft, mode and notes; invalid fields roll back the batch', () => {
    const project = demoProject();
    project.production = { fixedPrompt: 'style', notes: [], sceneReferenceIds: [], promptText: 'reference', textOnlyPrompt: 'text', promptMode: 'text-only' };
    const before = JSON.stringify(project);
    const next = applyOperations(project, [{ operation: 'production', patch: { promptText: 'updated' } }]);
    assert.deepEqual(next.production, { ...project.production, promptText: 'updated' });
    assert.equal(JSON.stringify(project), before);
    for (const patch of [{ notes: false }, { textOnlyPrompt: null }, { typo: 'bad' }]) {
        assert.throws(() => applyOperations(project, [{ operation: 'add', asset: 'shape-box', id: 'test' }, { operation: 'production', patch }]));
        assert.equal(JSON.stringify(project), before);
    }
});

test('inactive scene query selects before copying, leaves active scene and returned data independent', () => {
    const p = demoProject(); p.production = { fixedPrompt: '', sceneReferenceIds: [], notes: [], promptText: 'large'.repeat(20000) };
    const doc = duplicateDocumentScene(readSceneDocument(p), 'scene-main', 'second', 'b');
    const session = new SceneSession(doc);
    const before = session.context;
    const summary = session.readScene('scene-main');
    assert.equal(summary.project.production, undefined);
    assert.equal(summary.project.cuts, undefined);
    assert.equal('path' in summary.project.entities![0], false);
    assert.ok(JSON.stringify(summary).length < JSON.stringify(doc).length / 10);
    const result = session.readScene('scene-main', { sections: ['production'] });
    result.project.production!.promptText = 'changed outside';
    assert.equal(session.readScene('scene-main', { sections: ['production'] }).project.production!.promptText, p.production.promptText);
    const detail = session.readScene('scene-main', { ids: [p.entities[0].id], details: true });
    assert.equal(detail.project.entities!.length, 1); assert.ok('clips' in detail.project.entities![0]);
    assert.deepEqual(session.context, before);
    assert.equal(session.readScene('scene-main', { sections: [] }).project.entities, undefined);
});

test('combined edits commit once, preserve individual receipts and reject stale/invalid writes atomically', async () => {
    let commits = 0;
    const ctx = { project: demoProject(), revision: 0, time: 0, preview: 'program', selected: '', busy: false,
        history: { pending: false, undoStack: [], redoStack: [] }, engine: { exporting: false, externalModels: { retain() {} } },
        updateTimeUI() {}, change(fn: () => void) { fn(); (ctx as any).revision++; commits++; return true; },
    } as unknown as AppContext;
    const service = createToolService(ctx);
    const initial = await service.call('director_read', { sections: [] }); const revision = (initial.data as any).revision;
    const requests = ['a', 'b'].map(requestId => ({ revision, requestId, operations: [{ operation: 'add', asset: 'shape-box', id: requestId }] }));
    const args = { revision, requestId: 'combined', requests };
    const output = await service.call('director_apply', args);
    assert.equal(output.ok, true, output.error ?? 'batch failed'); assert.equal(commits, 1);
    for (const request of [args, ...requests]) assert.deepEqual(await service.call('director_apply', request), output);
    assert.equal(commits, 1);
    const before = JSON.stringify(ctx.project);
    const fresh = (output.data as any).revision;
    const invalid = { revision: fresh, requestId: 'bad-group', requests: [
        { revision: fresh, requestId: 'c', operations: [{ operation: 'add', asset: 'shape-box', id: 'c' }] },
        { revision: fresh, requestId: 'd', operations: [{ operation: 'update', id: 'missing', patch: { name: 'bad' } }] },
    ] };
    assert.equal((await service.call('director_apply', invalid)).ok, false);
    assert.equal(JSON.stringify(ctx.project), before);
    (ctx as any).revision++;
    assert.match((await service.call('director_apply', { ...invalid, requests: invalid.requests.map(r => ({ ...r, operations: [{ operation: 'add', asset: 'shape-box', id: r.requestId }] })) })).error!, /REVISION_CONFLICT/);
    assert.equal(commits, 1);
    assert.throws(() => validateToolInput('director_apply', { ...args, operations: [] }));
    assert.throws(() => validateToolInput('director_apply', { ...args, requests: [requests[0], { ...requests[1], revision: revision + 1 }] }));
});
