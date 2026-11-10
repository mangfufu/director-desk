import test from 'node:test';
import assert from 'node:assert/strict';
import { demoProject } from '../src/model.ts';
import { editCameraFocal, inspectorFocal } from '../src/editor/camera-focal.ts';
import { cameraFocal } from '../src/cinematography/camera-effects.ts';

test('focal inspector edits current animation key and preserves surrounding timing and easing', () => {
    const c = demoProject().entities.find(e => e.camera)!.camera!;
    c.effects = { channels: { focal: { keys: [{ time: 0, value: 28 }, { time: 10, value: 70, easing: 'linear' }] }, roll: 12 } };
    assert.equal(inspectorFocal(c, 5), 49);
    editCameraFocal(c, 5, 60, 24);
    assert.equal(cameraFocal(c.effects, 5, c.focal, 2), 60);
    assert.equal(cameraFocal(c.effects, 0, c.focal, 2), 28);
    assert.equal(cameraFocal(c.effects, 10, c.focal, 2), 70);
    editCameraFocal(c, 10, 80, 24);
    assert.deepEqual(c.effects.channels!.focal, {keys:[{time:0,value:28},{time:5,value:60,easing:'smooth'},{time:10,value:80,easing:'linear'}]});
    assert.equal(c.effects.channels!.roll, 12);
});

test('focal inspector updates active constant; rejects accidental dolly reset and invalid input', () => {
    const c = demoProject().entities.find(e => e.camera)!.camera!;
    c.effects = {channels:{focal:40}};
    editCameraFocal(c, 0, 50, 24);
    assert.equal(cameraFocal(c.effects, 0, c.focal, 2), 50);
    c.effects.dollyZoom = {distance:5,focal:40};
    const original = structuredClone(c);
    assert.equal(inspectorFocal(c, 0, 80), 80);
    assert.throws(() => editCameraFocal(c, 0, 65, 24), /希区柯克/);
    assert.throws(() => editCameraFocal(c, 0, NaN, 24), /焦距/);
    assert.deepEqual(c, original);
});
