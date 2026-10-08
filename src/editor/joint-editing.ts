import { jointAngles, type JointRotation } from '../assets/joint-schema.ts';
import type { Entity, Joint } from '../model.ts';
import { samplePose } from '../timeline.ts';

/** Shared pose write: static offsets remain static until the first pose key is recorded. */
export function setJointRotation(e: Entity, joint: Joint, value: JointRotation, time: number, fps: number) {
    if (!e.poseKeys.length) { e.pose[joint] = Array.isArray(value) ? [...value] : value; return; }
    const at = Math.round(time * fps) / fps, pose = samplePose(e, time);
    pose[joint] = Array.isArray(value) ? [...value] : value;
    const existing = e.poseKeys.find(k => Math.abs(k.time - at) < 1e-6);
    if (existing) existing.pose = pose; else e.poseKeys.push({ time: at, pose });
    e.poseKeys.sort((a, b) => a.time - b.time);
}
export function setJointAxis(e: Entity, joint: Joint, axis: number, value: number, time: number, fps: number) {
    const angles = jointAngles(samplePose(e, time)[joint], joint); angles[axis] = value;
    setJointRotation(e, joint, angles, time, fps);
}
