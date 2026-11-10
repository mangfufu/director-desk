import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { clone, entity, assertProject } from '../src/model.ts';
import { createScene } from '../src/scenes.ts';
import { packModelFiles } from '../src/resources/model-package.ts';
import { modelResourceId } from '../src/resources/project-resources.ts';
import { applyOperations } from '../src/automation/edits.ts';
import { validateToolInput } from '../src/automation/validate.ts';
import { sliceAction } from '../src/clip-editing.ts';
import { retargetSample } from '../src/resources/retarget-animation.ts';
import { REQUIRED_HUMAN_BONES, type HumanoidRig } from '../src/resources/rig-definition.ts';
import { ReconstructionResult } from '../src/reconstruction/result-model.ts';
import { buildProject } from '../src/reconstruction/build-project.ts';
import path from 'node:path';

async function fixture() {
    const p = createScene('blank');p.version = 2;
    const bytes = new Uint8Array(await fs.readFile('test-assets/external/CesiumMan/CesiumMan.glb'));
    const data = packModelFiles('motion.glb', [{ path: 'motion.glb', bytes }]);
    p.resources = [{ id: await modelResourceId(data), package: data, name: 'Recovered motion', copyright: '', source: '', license: '' }];
    const bones: HumanoidRig['bones'] = {};
    // Valid portable hierarchy; actual loaded bindings are covered by the desktop reconstruction test.
    REQUIRED_HUMAN_BONES.forEach((key, i) => bones[key] = '0' + '/0'.repeat(i + 1));
    const actor = entity('actor', 'external-model', 'Recovered actor', [3, 0, -2]);actor.id = 'person-0';
    actor.external = { resourceId: p.resources[0].id, appearance: 'color', unitScale: .8, orientation: [0, .3, 0], rig: { version: 1, family: 'humanoid', bones }, defaultPose: { '0/0': [.1, 0, 0] } };
    actor.face = 'fixed';actor.color = '#607080';actor.rotation = [0, .2, 0];actor.scale = [1.1, 1, .9];
    actor.path = { smooth: false, points: [{ time: 0, position: [3, 0, -2] }, { time: 8, position: [7, 0, -3] }] };
    actor.visibility = [{ id: 'visible-a', start: 1, end: 4 }, { id: 'visible-b', start: 5, end: 8 }];
    actor.clips = [{ id: 'motion', action: 'native', start: 1, end: 8, speed: 1.3, offset: .2, native: { index: 0, loop: true, motion: { mode: 'inPlace', node: '0/0' } } }];
    p.entities.push(actor);p.entities.find(e => e.camera)!.camera!.targetId = actor.id;
    assertProject(p);return { p, actor };
}

test('result appearance draft restores original motion and emits only chosen changes', async () => {
    const { p, actor } = await fixture(), before = clone(p), draft = new ReconstructionResult(p);
    draft.choose(actor.id, 'human-female');
    assert.deepEqual(p, before, 'preview must not edit the recognized source');
    assert.equal(draft.project.entities.find(e => e.id === actor.id)!.clips[0].action, 'retarget');
    draft.choose(actor.id, 'human-adult');
    assert.deepEqual(draft.operations(), [{ operation: 'replace-actor', id: actor.id, asset: 'human-adult' }]);
    assert.deepEqual(applyOperations(p, draft.operations()), draft.project, 'opened project matches the preview');
    const previous = draft.project;
    assert.throws(() => draft.choose(actor.id, 'camera'), /人形/);
    assert.equal(draft.project, previous);
    draft.choose(actor.id, actor.asset);
    assert.deepEqual(draft.operations(), []);
    assert.deepEqual(draft.project, before, 'returning to original restores native clip and calibration');
});

test('body replacement preserves directing data and native animation clocks, supports further replacement and split', async () => {
    const { p, actor } = await fixture(), before = clone(p);
    const op = { operation: 'replace-actor', id: actor.id, asset: 'human-female' };
    validateToolInput('director_apply', { revision: 1, requestId: 'replace', operations: [op] });
    const next = applyOperations(p, [op]), changed = next.entities.find(e => e.id === actor.id)!;
    for (const key of ['id','name','color','position','rotation','scale','path','visibility','face'] as const) assert.deepEqual(changed[key], actor[key], key);
    assert.equal(changed.external, undefined);assert.equal(changed.asset, 'human-female');assert.equal(changed.height, actor.height);
    assert.deepEqual(next.resources, p.resources);assert.deepEqual(next.entities.filter(e => e.id !== actor.id), p.entities.filter(e => e.id !== actor.id));
    const c = changed.clips[0];assert.equal(c.action, 'retarget');assert.equal(c.native, undefined);
    assert.deepEqual([c.id,c.start,c.end,c.speed,c.offset], ['motion',1,8,1.3,.2]);
    assert.deepEqual(c.retarget!.rig, actor.external!.rig);assert.deepEqual(c.retarget!.referencePose, actor.external!.defaultPose);
    assert.deepEqual(c.retarget!.motion, actor.clips[0].native!.motion);
    assert.deepEqual(p, before);
    const sample = retargetSample(changed, 6)!;
    changed.clips = [sliceAction(c, 1, 4), sliceAction(c, 4, 8)];
    assert.ok(Math.abs(retargetSample(changed, 6)!.time - sample.time) < 1e-12);
    const second = applyOperations(next, [{ ...op, asset: 'human-dwarf', patch: { height: 1.2 } }]);
    const dwarf = second.entities.find(e => e.id === actor.id)!;
    assert.deepEqual(dwarf.clips, changed.clips);assert.deepEqual(dwarf.path, actor.path);assert.equal(dwarf.height, 1.2);
    assertProject(JSON.parse(JSON.stringify(second)));
    assert.throws(() => applyOperations(second, [{ operation: 'resource-remove', id: p.resources![0].id }]), /引用|使用/);
});

test('replacement rejects incomplete motion mapping, locked actors and nonhuman targets atomically', async () => {
    const { p, actor } = await fixture();
    for (const asset of ['chair','animal-dog','camera','missing']) assert.throws(() => applyOperations(p, [{ operation: 'replace-actor', id: actor.id, asset }]), /内置人形/);
    actor.locked = true;assert.throws(() => applyOperations(p, [{ operation: 'replace-actor', id: actor.id, asset: 'human-adult' }]), /锁定/);actor.locked = false;
    delete actor.external!.rig!.bones.head;const before = clone(p);
    assert.throws(() => applyOperations(p, [{ operation: 'replace-actor', id: actor.id, asset: 'human-adult' }]), /骨骼映射/);assert.deepEqual(p, before);
});

test('reconstruction model choice is saved in the produced file with original timing and resources', async t => {
    const { actor } = await fixture();
    const base = path.resolve('tmp/video-to-project/tests'); await fs.mkdir(base,{recursive:true});
    const dir = await fs.mkdtemp(path.join(base,'actor-model-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
    await fs.copyFile('test-assets/external/CesiumMan/CesiumMan.glb',path.join(dir,'person.glb'));
    await fs.writeFile(path.join(dir,'scene.json'),JSON.stringify({duration:8,aspect:'16:9',objects:[{
        kind:'actor',id:actor.id,name:actor.name,file:'person.glb',position:actor.position,path:actor.path,
        start:1,end:8,visibility:actor.visibility!.map(({start,end})=>({start,end})),rig:actor.external!.rig,
    }],cameras:[{time:0,position:[0,2,8],target:[0,1,0],focal:35,roll:0}]}));
    validateToolInput('director_reconstruct',{action:'start',path:path.join(dir,'source.mp4'),actorModel:'human-female',requestId:'model-test'});
    assert.throws(()=>validateToolInput('director_reconstruct',{action:'start',actorModel:'camera',requestId:'model-test'}));
    const raw=JSON.parse(await fs.readFile((await buildProject(dir)).file,'utf8'));
    const body=JSON.parse(await fs.readFile((await buildProject(dir,{actorModel:'human-female'})).file,'utf8'));
    const source=raw.scenes[0].state.entities[0],target=body.scenes[0].state.entities[0];
    assert.equal(source.asset,'external-model');assert.equal(target.asset,'human-female');assert.equal(target.clips[0].action,'retarget');
    for(const key of ['id','name','path','position','visibility'])assert.deepEqual(target[key],source[key]);
    assert.deepEqual(body.resources,raw.resources);assert.deepEqual(body.scenes[0].state.cuts,raw.scenes[0].state.cuts);
    await assert.rejects(buildProject(dir,{actorModel:'camera'}),/人物模型/);
});
