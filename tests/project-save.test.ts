import test from 'node:test';
import assert from 'node:assert/strict';
import { saveProjectFile } from '../src/ui/project-save.ts';
import type { AppContext } from '../src/app-context.ts';

test('save marks clean only after confirmed disk success, keeping canceled/failed work dirty and blocking concurrent edits', async () => {
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window'), previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
    let complete: (v: unknown) => void = () => {};
    const states: string[] = [];
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { directorDesktop: { files: () => new Promise(resolve => complete = resolve) } } });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { querySelector: () => ({ textContent: '' }) } });
    const ctx = { dirty: true, busy: false, playing: true, draft: null, engine: { exporting: false }, history: { pending: null },
        scenes: { markSaved() {}, document: () => ({ name: '测试', scenes: [{ id: 'first' }, { id: 'second' }] }) }, updateTimeUI() {}, toast: (s: string) => states.push(s),
    } as unknown as AppContext;
    try {
        let saving = saveProjectFile(ctx); assert.equal(ctx.dirty, true); assert.equal(ctx.busy, true);
        assert.equal(await saveProjectFile(ctx), false);
        complete({ ok: true, data: { saved: false } }); assert.equal(await saving, false);
        assert.equal(ctx.dirty, true); assert.equal(ctx.busy, false);
        saving = saveProjectFile(ctx); complete({ ok: false, error: 'disk full' }); assert.equal(await saving, false);
        assert.equal(ctx.dirty, true); assert.equal(ctx.busy, false);
        saving = saveProjectFile(ctx); complete({ ok: true, data: { saved: true } }); assert.equal(await saving, true);
        assert.equal(ctx.dirty, false); assert.equal(ctx.busy, false); assert.ok(states.includes('项目已保存'));
    } finally {
        if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow); else Reflect.deleteProperty(globalThis, 'window');
        if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument); else Reflect.deleteProperty(globalThis, 'document');
    }
});

test('browser download allows save-and-open continuation without claiming confirmed disk persistence', async () => {
    const w = Object.getOwnPropertyDescriptor(globalThis, 'window'), d = Object.getOwnPropertyDescriptor(globalThis, 'document');
    let clicks = 0;
    Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({click() { clicks++; }}) } });
    const originalTimeout = globalThis.setTimeout;
    // Do not leave download URL disposal timers alive in this unit test.
    globalThis.setTimeout = ((fn: () => void) => { fn(); return 0; }) as unknown as typeof setTimeout;
    const ctx = { dirty:true,busy:false,playing:false,draft:null,engine:{exporting:false},history:{pending:null},
        scenes:{document:()=>({name:'web',scenes:[]})},updateTimeUI(){},toast(){} } as unknown as AppContext;
    try { assert.equal(await saveProjectFile(ctx), true); assert.equal(clicks, 1); assert.equal(ctx.dirty, true); assert.equal(ctx.busy, false); }
    finally {
        globalThis.setTimeout = originalTimeout;
        if (w) Object.defineProperty(globalThis,'window',w); else Reflect.deleteProperty(globalThis,'window');
        if (d) Object.defineProperty(globalThis,'document',d); else Reflect.deleteProperty(globalThis,'document');
    }
});
