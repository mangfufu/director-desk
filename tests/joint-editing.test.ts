import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { assertProject, demoProject, entity, clip } from '../src/model.ts';
import { samplePose } from '../src/timeline.ts';
import { mirrorPose } from '../src/assets/joint-schema.ts';
import { setJointAxis } from '../src/editor/joint-editing.ts';
import { JointNodes } from '../src/editor/joint-nodes.ts';
import { makeHuman } from '../src/assets/humanoid.ts';
import { animateHuman, sampleHumanBody } from '../src/assets/human-animation.ts';
import { AUTHORED_HUMAN_ACTIONS } from '../src/assets/authored-human-actions.ts';

test('legacy scalar poses and mixed XYZ pose keys interpolate without changing old projects', () => {
    const actor = entity('actor', 'human-adult', 'Test'); actor.poseKeys = [{ time: 0, pose: { leftArm: 10, headYaw: 20 } }, { time: 2, pose: { leftArm: [30, 20, -10], headYaw: [0, 40, 0] } }];
    assert.deepEqual(samplePose(actor, 1), { leftArm: [20, 10, -5], headYaw: [0, 30, 0] });
    actor.poseKeys[1].pose.leftArm = 30; assert.equal(samplePose(actor, 1).leftArm, 20);
});
test('XYZ joint editing preserves other axes and records at the current project frame', () => {
    const actor = entity('actor', 'human-adult', 'Test'); actor.pose = { leftArm: [5, 10, 15] };
    setJointAxis(actor, 'leftArm', 1, 40, 1, 24); assert.deepEqual(actor.pose.leftArm, [5, 40, 15]);
    actor.poseKeys = [{ time: 0, pose: {} }]; setJointAxis(actor, 'leftArm', 2, 25, .51, 24);
    assert.equal(actor.poseKeys[1].time, .5); assert.deepEqual(actor.poseKeys[1].pose.leftArm, [5, 40, 25]);
    assert.deepEqual(mirrorPose({ leftArm: [5, 10, 15], headYaw: 20 }), { rightArm: [5, -10, -15], headYaw: -20 });
});
test('XYZ offsets affect the sampled bone and repeat after seeking', () => {
    const actor = entity('actor', 'human-adult', 'Test'), rig = makeHuman(actor);
    actor.clips = [clip('punch', 0, 1)]; sampleHumanBody(rig, actor, .3); const base = rig.joints.leftArm.rotation.clone();
    actor.poseKeys = [{ time: 0, pose: { leftArm: [10, 20, 30] } }, { time: 1, pose: { leftArm: [10, 20, 30] } }];
    animateHuman(rig, actor, .3); const expected = new T.Quaternion().setFromEuler(new T.Euler(base.x + T.MathUtils.degToRad(10), base.y + T.MathUtils.degToRad(20), base.z + T.MathUtils.degToRad(30)));
    assert.ok(rig.joints.leftArm.quaternion.angleTo(expected) < 1e-7);
    const before = rig.joints.leftArm.quaternion.toArray(); animateHuman(rig, actor, .8); animateHuman(rig, actor, .3); assert.deepEqual(rig.joints.leftArm.quaternion.toArray(), before);
});
test('shared validation accepts hips/ankles/XYZ and rejects malformed rotations', () => {
    const project = demoProject(), actor = entity('actor', 'human-adult', 'Test'); project.entities.push(actor);
    actor.pose = { hips: [0, 10, 0], leftAnkle: [10, 0, 4] }; assertProject(project);
    for (const value of [[0, 1], [0, NaN, 0], [0, 361, 0]]) { actor.pose.leftAnkle = value as [number, number, number]; assert.throws(() => assertProject(project), /姿态/); }
});
test('joint nodes follow bones, support picking and remain on the editor layer', () => {
    const rig = makeHuman(entity('actor', 'human-adult', 'Test')), nodes = new JointNodes(); nodes.bind(rig);
    const camera = new T.PerspectiveCamera(45, 1, .01, 50); camera.position.set(0, 1, 4); camera.lookAt(0, 1, 0); camera.updateMatrixWorld(true);
    nodes.update(camera, 800); const marker = nodes.root.children.find(n => n.userData.joint === 'rightElbow')!;
    assert.ok(marker.position.distanceTo(rig.joints.rightElbow.getWorldPosition(new T.Vector3())) < 1e-8);
    const ray = new T.Raycaster(camera.position, marker.position.clone().sub(camera.position).normalize()); ray.layers.enable(1); nodes.root.updateMatrixWorld(true);
    assert.equal(nodes.pick(ray), 'rightElbow'); nodes.root.traverse(n => assert.equal(n.layers.mask, 2));
    assert.equal(rig.root.getObjectByName('joint-editor'), undefined); nodes.dispose();
});
test('all 23 default motions have explicit authored keys and seamless loop endpoints', () => {
    assert.equal(Object.keys(AUTHORED_HUMAN_ACTIONS).length, 23);
    for (const motion of Object.values(AUTHORED_HUMAN_ACTIONS)) {
        assert.equal(motion.keys[0].time, 0); assert.equal(motion.keys.at(-1)!.time, 1);
        assert.ok(motion.keys.every((key, i) => i === 0 || key.time > motion.keys[i - 1].time));
        if (motion.loop) assert.deepEqual({ ...motion.keys.at(-1), time: 0 }, motion.keys[0]);
    }
});

test('new XYZ head offsets compose with legacy absolute yaw regardless of pose key order', () => {
    const actor = entity('actor', 'human-adult', 'Test'), rig = makeHuman(actor);
    actor.pose = { head: [10, 15, 5], headYaw: 30 }; animateHuman(rig, actor, 0);
    const first = rig.head.quaternion.toArray();
    assert.ok(Math.abs(T.MathUtils.radToDeg(rig.head.rotation.y) - 45) < 1e-6);
    actor.pose = { headYaw: 30, head: [10, 15, 5] }; animateHuman(rig, actor, 0);
    assert.deepEqual(rig.head.quaternion.toArray(), first);
});

test('editing legacy head yaw axes preserves the unedited yaw during an authored action', () => {
    const actor=entity('actor','human-adult','Test'),rig=makeHuman(actor);
    actor.clips=[clip('point',0,3)];actor.pose={headYaw:30};
    animateHuman(rig,actor,1.5);const before=rig.head.rotation.clone();
    setJointAxis(actor,'headYaw',0,10,1.5,24);animateHuman(rig,actor,1.5);
    assert.ok(Math.abs(rig.head.rotation.y-before.y)<1e-8);
    assert.ok(Math.abs(rig.head.rotation.x-before.x-T.MathUtils.degToRad(10))<1e-8);
    setJointAxis(actor,'headYaw',2,5,1.5,24);animateHuman(rig,actor,1.5);
    assert.ok(Math.abs(rig.head.rotation.y-before.y)<1e-8);
});

test('mixed scalar and XYZ head yaw keys keep absolute Y semantics through interpolation', () => {
    const actor=entity('actor','human-adult','Test'),rig=makeHuman(actor);
    actor.clips=[clip('point',0,3)];
    actor.poseKeys=[{time:0,pose:{headYaw:30}},{time:2,pose:{headYaw:[10,30,5]}}];
    for(const time of [0,.5,1,1.5,2]) {
        animateHuman(rig,actor,time);
        assert.ok(Math.abs(T.MathUtils.radToDeg(rig.head.rotation.y)-30)<1e-8,`time ${time}`);
    }
});
