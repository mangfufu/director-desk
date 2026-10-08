import * as T from 'three';
import { AUTHORED_HUMAN_ACTIONS, sampleAuthoredHumanAction } from './authored-human-actions.ts';
import { jointAngles } from './joint-schema.ts';
import { supportHumanFeet } from './human-support.ts';
import type { Entity } from '../model.ts';
import type { Rig } from './human-legacy.ts';
import { samplePose, sampledAction, activeClip, previousClip } from '../timeline.ts';

export function sampleHumanAction(r: Rig, e: Entity, time: number, phaseOffset = 0) {
    const sampled = sampledAction(e, time), action = sampled.action, t = sampled.local + phaseOffset;
    const performanceProgress = sampled.progress * (activeClip(e, time)?.speed ?? 1);
    for (const j of Object.values(r.joints)) j.rotation.set(0, 0, 0);
    sampleAuthoredHumanAction(r, action as import('../model.ts').Action, t, action === 'turn' ? sampled.progress : performanceProgress);
}

export function sampleHumanBody(r: Rig, e: Entity, time: number, phaseOffset = 0) {
    const active = activeClip(e, time), duration = e.actionBlend ?? .2, last = previousClip(e, time);
    const anchor = active ? active.start - (active.progressOffset ?? 0) : last?.end ?? 0;
    const window = active ? Math.min(duration, active.sourceDuration ?? active.end - active.start) : duration;
    const previous = previousClip(e, anchor + 1e-8), blend = anchor > 0 && window > 0 && time - anchor < window;
    if (!blend) { sampleHumanAction(r, e, time, phaseOffset); return; }
    const adjacent = previous && Math.abs(previous.end - anchor) < 1e-6;
    if (adjacent) {
        // Continue an adjacent outgoing clip so the handoff retains its velocity.
        const outgoing = { ...e, clips: [{ ...previous, end: anchor + window + 1e-6,
            sourceDuration: previous.sourceDuration ?? previous.end - previous.start }] };
        sampleHumanAction(r, outgoing, time, phaseOffset);
    } else {
        // A gap has its own idle/held pose, possibly still blending out of the last clip.
        sampleHumanBody(r, { ...e, clips: e.clips.filter(c => c.end <= anchor) }, time, phaseOffset);
    }
    const hipPosition = r.hips.position.clone(), hipRotation = r.hips.quaternion.clone();
    if (previous?.action === 'turn' && Math.abs(previous.end - anchor) < 1e-6)
        hipRotation.premultiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), -(previous.turnAmount ?? 1) * Math.PI));
    const rotations = Object.fromEntries(Object.entries(r.joints).map(([k, v]) => [k, v.quaternion.clone()]));
    sampleHumanAction(r, e, time, phaseOffset);
    const t = T.MathUtils.clamp((time - anchor) / window, 0, 1), u = t*t*t*(10+t*(-15+6*t));
    r.hips.position.lerpVectors(hipPosition, r.hips.position, u); r.hips.quaternion.slerp(hipRotation, 1 - u);
    for (const [key, joint] of Object.entries(r.joints)) joint.quaternion.slerp(rotations[key], 1 - u);
    if (AUTHORED_HUMAN_ACTIONS[sampledAction(e, time).action as import('../model.ts').Action]?.contact !== 'body') supportHumanFeet(r);
}
export function animateHuman(r: Rig, e: Entity, time: number, phaseOffset = 0) {
    sampleHumanBody(r, e, time, phaseOffset); applyHumanPose(r, e, time);
}
export function applyHumanPose(r: Rig, e: Entity, time: number) {
    const pose = samplePose(e, time);
    // headYaw keeps absolute Y in both scalar and XYZ form; head remains additive.
    if (pose.headYaw !== undefined) {
        const [x, y, z] = jointAngles(pose.headYaw, 'headYaw');
        r.head.rotation.x += T.MathUtils.degToRad(x);
        r.head.rotation.y = T.MathUtils.degToRad(y);
        r.head.rotation.z += T.MathUtils.degToRad(z);
    }
    for (const [joint, v] of Object.entries(pose)) {
        if (joint === 'headYaw') continue;
        const node = joint === 'hips' ? r.hips : joint === 'headYaw' ? r.head : r.joints[joint];
        if (!node) continue;
        const angles = jointAngles(v, joint);
        node.rotation.x += T.MathUtils.degToRad(angles[0]); node.rotation.y += T.MathUtils.degToRad(angles[1]); node.rotation.z += T.MathUtils.degToRad(angles[2]);
    }
}
