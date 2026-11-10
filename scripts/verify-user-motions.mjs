import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const folder = 'tmp/user-motions'; await fs.mkdir(folder, { recursive: true });
// Public CC0 fixture, downloaded separately with provenance; never included in the release payload.
const original = await fs.readFile('test-assets/external/quaternius-animations/library-2/Universal Animation Library 2 [Standard]/Unreal-Godot/UAL2_Standard.glb');
const source = JSON.parse(original.subarray(20, 20 + original.readUInt32LE(12)).toString());
source.nodes.forEach(node => { delete node.mesh; delete node.skin; });
delete source.meshes; delete source.materials; delete source.textures; delete source.images;
const json = Buffer.from(JSON.stringify(source)), padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 32); json.copy(padded);
const header = Buffer.alloc(20), rest = original.subarray(20 + original.readUInt32LE(12));
header.write('glTF'); header.writeUInt32LE(2, 4); header.writeUInt32LE(20 + padded.length + rest.length, 8);
header.writeUInt32LE(padded.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
await fs.writeFile(`${folder}/skeleton-only.glb`, Buffer.concat([header, padded, rest]));
const picks = ['OverhandThrow', 'Melee_Hook', 'ClimbUp_1m_RM', 'Slide_Loop'];
const indices = picks.map(name => source.animations.findIndex(a => a.name === name)); assert.ok(indices.every(i => i >= 0));
const server = await createServer({ server: { host: '127.0.0.1', port: 0, watch: { ignored: ['**/tmp/**'] } } }); await server.listen(); let browser;
try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } }), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`); await page.waitForFunction(() => window.__director);
    const actorId = await page.evaluate(async () => {
        const api = window.__director, actor = api.getProject().entities.find(e => e.kind === 'actor');
        await api.callTool('director_view', { time: 0, entityId: actor.id });
        window.__motionBefore = JSON.stringify(api.getDocument()); return actor.id;
    });
    await page.locator('#resource-home').click(); await page.locator('[data-side="motions"]').click(); await page.locator('.motion-browser [data-act="user-motion-library"]').click();
    await page.locator('#user-motion-files').setInputFiles(`${folder}/skeleton-only.glb`);
    await page.waitForSelector('#uml-clip', { timeout: 30000 });
    assert.match(await page.locator('#user-motion-status').innerText(), /映射完整/);
    await page.locator('#user-motion-view').selectOption('human');
    await page.locator('#user-motion-time').evaluate(el=>{el.value='.5';el.dispatchEvent(new Event('input',{bubbles:true}));});
    await page.waitForFunction(()=>document.querySelector('#user-motion-clock').textContent==='0.50 s');
    assert.equal(await page.locator('#user-motion-play').innerText(),'播放预览');
    await page.locator('[data-user-motion-tab="rig"]').click();
    await page.locator('#uml-scale').fill('0.000000001');await page.locator('#uml-scale').press('Tab');
    assert.equal(await page.locator('#uml-scale').inputValue(),'1','failed retarget calibration rolls back');
    await page.waitForFunction(()=>document.querySelector('#user-motion-clock').textContent==='0.50 s');
    await page.locator('#uml-facing-Y').fill('90');await page.locator('#uml-facing-Y').press('Tab');
    assert.equal(await page.locator('#uml-facing-Y').inputValue(),'90');
    await page.screenshot({path:`${folder}/calibration-human.png`});
    await page.locator('#user-motion-view').selectOption('source');
    await page.locator('[data-user-motion-tab="action"]').click();
    for (let i = 0; i < indices.length; i++) {
        await page.locator('#uml-clip').selectOption(String(indices[i]));
        await page.locator('#uml-name').fill(['公开素材 · 投掷', '公开素材 · 勾拳', '公开素材 · 攀爬', '公开素材 · 滑行'][i]);
        await page.locator('#uml-name').press('Tab');
        await page.locator('[data-user-motion-tab="source"]').click();
        await page.locator('#uml-source').fill('Quaternius · https://quaternius.com/packs/universalanimationlibrary2.html');
        await page.locator('#uml-license').fill('CC0-1.0'); await page.locator('#uml-license').press('Tab');
        await page.locator('#user-motion-save').click();
        await page.waitForFunction(count => document.querySelectorAll('[data-user-motion-id]').length === count, i + 1);
        await page.locator('[data-user-motion-tab="action"]').click();
    }
    assert.equal(await page.evaluate(() => window.__motionBefore === JSON.stringify(window.__director.getDocument())), true);
    const overflow = await page.locator('.user-motion-modal').evaluate(root => [...root.querySelectorAll('button,input,select')].filter(e => e.getClientRects().length).filter(e => { const r=e.getBoundingClientRect(); return r.bottom>innerHeight || r.right>innerWidth || r.top<0; }).map(e=>e.id));
    assert.deepEqual(overflow, []);
    await page.screenshot({ path: `${folder}/library.png` });
    await page.locator('#uml-duration').fill('3'); await page.locator('#user-motion-apply').click();
    await page.waitForSelector('.user-motion-modal', { state: 'detached', timeout: 30000 });
    // Existing placed clips expose calibration without rewriting their source library entry.
    await page.locator('[data-retarget-action="panel"][data-panel="correction"]').click();
    await page.locator('[data-retarget-axis="1"]').fill('45');await page.locator('[data-retarget-axis="1"]').press('Tab');
    let orientation=await page.evaluate(id=>window.__director.getProject().entities.find(e=>e.id===id).clips.find(c=>c.retarget).retarget.orientation[1],actorId);
    assert.ok(Math.abs(orientation-Math.PI/4)<1e-6);
    await page.locator('#timeline-content').focus();await page.keyboard.press('Control+z');
    orientation=await page.evaluate(id=>window.__director.getProject().entities.find(e=>e.id===id).clips.find(c=>c.retarget).retarget.orientation[1],actorId);
    assert.equal(orientation,0);
    await page.screenshot({path:`${folder}/placed-correction.png`});
    await page.evaluate(async()=>{const {setLanguage}=await import('/src/i18n/locale.ts');setLanguage('en');});
    await page.waitForFunction(()=>document.querySelector('[data-panel="correction"]').textContent==='Motion Calibration');
    assert.equal(await page.locator('[data-retarget-axis="1"]').getAttribute('aria-label'),'Motion Orientation Y');
    await page.evaluate(async()=>{const {setLanguage}=await import('/src/i18n/locale.ts');setLanguage('zh-CN');});
    const correctionBounds=await page.locator('.retarget-correction').evaluate(root=>{
        const bounds=document.querySelector('#inspector-content').getBoundingClientRect();
        return [...root.querySelectorAll('input,select')].filter(e=>{const r=e.getBoundingClientRect();return r.bottom>bounds.bottom+1||r.right>bounds.right+1;}).map(e=>({html:e.outerHTML,rect:e.getBoundingClientRect().toJSON(),bounds:bounds.toJSON()}));
    });assert.deepEqual(correctionBounds,[],'calibration controls fit inspector');
    await page.screenshot({path:`${folder}/placed-correction.png`});
    const result = await page.evaluate(async actorId => {
        const api = window.__director, p = api.getProject(), actor = p.entities.find(e => e.id === actorId), clip = actor.clips.find(c => c.action === 'retarget');
        if (!clip) throw Error('User motion not applied');
        const query = await api.callTool('director_motions', { source: 'user', query: '投掷' });
        if (!query.ok) throw Error(query.error);
        const { assertSceneDocument } = await import('/src/scenes/sequence-project.ts'); assertSceneDocument(api.getDocument());
        return { query: query.data, resourceCount: p.resources.length, duration: clip.end - clip.start };
    }, actorId);
    assert.equal(result.resourceCount, 1); assert.equal(result.duration, 3); assert.equal(result.query.presets.length, 1);
    await page.reload(); await page.waitForFunction(() => window.__director);
    const library = await page.evaluate(async () => (await window.__director.callTool('director_motions', { source: 'user', query: '公开素材' })).data);
    assert.equal(library.presets.length, 4);
    // MCP uses the same motion operation, including a newly added target in one atomic batch.
    const toolCheck = await page.evaluate(async id => {
        const api = window.__director, call = async (name, args) => { const r = await api.callTool(name, args); if (!r.ok) throw Error(r.error); return r.data; }, state = await call('director_read', {});
        const preview = await call('director_apply', { revision: state.revision, requestId: 'motion-preview', preview: true,
            operations: [{ operation: 'add', asset: 'human-adult', id: 'motion-agent-person' }, { operation: 'motion', id: 'motion-agent-person', asset: id, time: 0, duration: 2 }] });
        const { removeUserMotion } = await import('/src/animation/user-motion-store.ts'); await removeUserMotion(id);
        const committed = await call('director_apply', { revision: preview.revision, requestId: 'motion-commit', previewId: preview.previewId });
        const actor = api.getProject().entities.find(e => e.id === 'motion-agent-person');
        if (!actor?.clips.length || !committed.committed) throw Error('Cached preview lost its motion source');
        return actor.clips[0].retarget.resourceId;
    }, result.query.presets[0].id);
    assert.ok(toolCheck.startsWith('model-'));
    // Real FBX loader and mapping, independent of the mesh-free GLB fixture above.
    const fbx = await page.evaluate(async () => {
        const path = '/test-assets/external/quaternius-animations/library-2/Universal Animation Library 2 [Standard]/Unity/UAL2_Standard.fbx';
        const bytes = new Uint8Array(await (await fetch(path)).arrayBuffer());
        const { importMotionFile, motionFromSource } = await import('/src/animation/import-user-motion.ts');
        const asset = await importMotionFile('public.fbx', [{ path: 'public.fbx', bytes }]);
        const info = asset.model.inspection, m = motionFromSource(asset.resource, info, info.animations.find(a=>a.duration>0).index);
        asset.model.dispose(); return { animations: info.animations.length, bones: info.bones.length, complete: info.rigSuggestion.complete, duration: m.duration };
    });
    assert.ok(fbx.animations > 1 && fbx.bones > 10 && fbx.complete && fbx.duration > 0);
    await page.setViewportSize({ width: 1000, height: 680 });
    await page.locator('#resource-home').click(); await page.locator('[data-side="motions"]').click(); await page.locator('.motion-browser [data-act="user-motion-library"]').click();
    await page.locator('[data-user-motion-id]').first().click();
    await page.waitForSelector('#uml-name');
    for (const tab of ['action', 'rig', 'source']) {
        await page.locator(`[data-user-motion-tab="${tab}"]`).click();
        const clipped = await page.locator('.user-motion-modal').evaluate(root => [...root.querySelectorAll('button,input,select')].filter(e => e.getClientRects().length).filter(e => { const r=e.getBoundingClientRect(); return r.bottom>innerHeight || r.right>innerWidth || r.top<0; }).map(e=>e.id));
        assert.deepEqual(clipped, [], tab + ' clipped controls');
    }
    assert.deepEqual(errors, []);
    console.log('User motions passed: skeleton-only import, 4 CC0 animations, source preview, persistent library, portable application, same-batch MCP and frozen preview after library deletion.');
} finally { await browser?.close(); await server.close(); }
