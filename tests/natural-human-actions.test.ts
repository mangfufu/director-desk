import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { entity, clip } from '../src/model.ts';
import { makeHuman } from '../src/assets/humanoid.ts';
import { sampleHumanAction, sampleHumanBody } from '../src/assets/human-animation.ts';
import { motionPreset } from '../src/animation/motion-catalog.ts';
import { disposeTree } from '../src/assets/dispose.ts';
import { sliceAction } from '../src/clip-editing.ts';

test('standing, walking, running and support-leg gestures keep feet above the actor floor across proportions', () => {
    for (const asset of ['person', 'human-adult', 'human-female', 'human-dwarf', 'human-giant']) {
        const e = entity('actor', asset, asset), r = makeHuman(e);
        try {
            for (const action of ['idle', 'walk', 'run', 'crouch', 'kick', 'roundhouse', 'dodge'] as const) {
                e.clips = [clip(action, 0, 3)];
                for (let i = 0; i < 60; i++) {
                    sampleHumanAction(r, e, i / 20); r.root.updateMatrixWorld(true);
                    for (const side of ['left', 'right']) {
                        const foot = r.joints[side + 'Ankle'];
                        const min = new T.Box3().setFromObject(foot, true).min.y;
                        assert.ok(min > -.025, `${asset}/${action}/${i}: foot penetrates ${min}`);
                    }
                }
            }
        } finally { disposeTree(r.root); }
    }
});

test('jump anticipates, clears the floor and lands; roundhouse never rotates the torso through a full circle', () => {
    const e = entity('actor', 'human-adult', 'Test'), r = makeHuman(e);
    try {
        e.clips = [clip('jump', 0, 2)]; const low = (time: number) => { sampleHumanAction(r, e, time); return new T.Box3().setFromObject(r.root, true).min.y; };
        assert.ok(Math.abs(low(.2)) < .025); assert.ok(low(1) > .4); assert.ok(Math.abs(low(1.99)) < .025);
        e.clips = [clip('roundhouse', 0, 2)];
        for (let i = 0; i < 120; i++) { sampleHumanAction(r, e, i / 60); assert.ok(Math.abs(r.hips.rotation.y) < 1.2); }
    } finally { disposeTree(r.root); }
});

test('curve-based actions preserve the original pose when timeline clips are split', () => {
    for (const action of ['walk', 'run', 'punch', 'throw', 'roll', 'fall'] as const) {
        const e = entity('actor', 'human-adult', action), r = makeHuman(e), original = clip(action, 0, 3);
        original.speed = 1.4; original.offset = .15; e.clips = [original];
        const pose = (time: number) => { sampleHumanBody(r, e, time); return [r.hips, ...Object.values(r.joints)].flatMap(n => [...n.position.toArray(), ...n.quaternion.toArray()]); };
        try {
            const before = pose(1.7); e.clips = [sliceAction(original, 0, 1.2, false), sliceAction(original, 1.2, 3)];
            assert.deepEqual(pose(1.7), before, action);
        } finally { disposeTree(r.root); }
    }
});

test('catalog one-shot timings use an appropriate short performance instead of a universal three seconds', () => {
    assert.equal(motionPreset('basic-punch').defaultDuration, 1);
    assert.equal(motionPreset('basic-kick').defaultDuration, 1.1);
    assert.equal(motionPreset('basic-roll').defaultDuration, 1.5);
    assert.equal(motionPreset('basic-walk').loop, true);
});

test('one-shot action speed changes performance timing without changing the saved clip length', () => {
    const e = entity('actor', 'human-adult', 'Test'), r = makeHuman(e); e.clips = [clip('punch', 0, 2)];
    try {
        sampleHumanAction(r, e, .8); const normal = Object.values(r.joints).flatMap(n => n.quaternion.toArray());
        e.clips[0].speed = 2; sampleHumanAction(r, e, .4);
        assert.deepEqual(Object.values(r.joints).flatMap(n => n.quaternion.toArray()), normal);
        assert.equal(e.clips[0].end, 2);
    } finally { disposeTree(r.root); }
});

test('action handoffs interpolate toward the incoming joint pose instead of retaining the outgoing quaternion', () => {
    const e = entity('actor', 'human-adult', 'Test'), r = makeHuman(e); e.clips = [clip('wave', 0, 1), clip('run', 1, 3)];
    try {
        const outgoingEntity = { ...e, clips: [{ ...e.clips[0], end: 1.2, sourceDuration: 1 }] };
        sampleHumanAction(r, outgoingEntity, 1.1); const outgoing = r.joints.rightArm.quaternion.clone();
        sampleHumanAction(r, e, 1.1); const incoming = r.joints.rightArm.quaternion.clone();
        sampleHumanBody(r, e, 1.1);
        assert.ok(r.joints.rightArm.quaternion.angleTo(outgoing.clone().slerp(incoming, .5)) < 1e-6);
        assert.ok(r.joints.rightArm.quaternion.angleTo(outgoing) > .1);
    } finally { disposeTree(r.root); }
});
