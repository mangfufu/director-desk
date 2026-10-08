import * as T from 'three';
import { authoredCurve } from '../animation/authored-curve.ts';
import type { Action } from '../model.ts';
import type { Rig } from './human-legacy.ts';
import { supportHumanFeet, supportHumanBody } from './human-support.ts';

type Angles = number | [number, number, number];
type Pose = Partial<Record<string, Angles>>;
interface Key { time: number; pose: Pose; lift: number; hips: [number, number, number] }
interface Motion { duration: number; loop?: boolean; contact?: 'feet' | 'body' | 'none'; keys: Key[] }
const key = (time: number, pose: Pose = {}, lift = 0, hips: [number, number, number] = [0, 0, 0]): Key => ({ time, pose, lift, hips });
const neutral: Pose = { torso: 0, head: 0, leftArm: [0, 0, -5], rightArm: [0, 0, 5],
    leftElbow: -8, rightElbow: -8, leftHip: -2, rightHip: -2, leftKnee: 4, rightKnee: 4, leftAnkle: -2, rightAnkle: -2 };
const guard: Pose = { torso: 5, head: -4, leftArm: [-36, -12, -15], rightArm: [-48, 15, 12],
    leftElbow: -105, rightElbow: -112, leftHip: -12, rightHip: -10, leftKnee: 20, rightKnee: 18, leftAnkle: -8, rightAnkle: -8 };
const seated: Pose = { torso: 4, head: -3, leftHip: -88, rightHip: -88, leftKnee: 90, rightKnee: 90,
    leftAnkle: -2, rightAnkle: -2, leftArm: -24, rightArm: -24, leftElbow: -66, rightElbow: -66 };
const prone: Pose = { torso: -4, head: -12, leftArm: [10, 0, -18], rightArm: [10, 0, 18], leftHip: 0, rightHip: 0,
    leftKnee: 8, rightKnee: 8, leftAnkle: -8, rightAnkle: -8 };
const g = (pose: Pose = {}) => ({ ...guard, ...pose });
const s = (pose: Pose = {}) => ({ ...seated, ...pose });

/** Hand-authored body keys in degrees. Times are normalized; paths own scene travel. */
export const AUTHORED_HUMAN_ACTIONS: Record<Action, Motion> = {
    idle: { duration: 4, loop: true, keys: [key(0), key(.25, { torso: 1, head: -.5 }, .002), key(.5), key(.75, { torso: -.5, head: .5 }, .001), key(1)] },
    walk: { duration: 1.12, loop: true, keys: [
        key(0, { leftHip: -24, leftKnee: 8, leftAnkle: 16, rightHip: 20, rightKnee: 22, rightAnkle: -30, leftArm: 17, rightArm: -17 }, 0, [0, -3, 1]),
        key(.125, { leftHip: -12, leftKnee: 20, leftAnkle: -8, rightHip: 10, rightKnee: 48, rightAnkle: -22, leftArm: 10, rightArm: -10 }, -.016, [0,-2, .7]),
        key(.25, { leftHip: 3, leftKnee: 6, leftAnkle: -9, rightHip: -12, rightKnee: 52, rightAnkle: -15 }, .012, [0,0,0]),
        key(.375, { leftHip: 15, leftKnee: 9, leftAnkle: -24, rightHip: -25, rightKnee: 20, rightAnkle: 5, leftArm: -12, rightArm: 12 }, .006, [0,2,-.7]),
        key(.5, { leftHip: 20, leftKnee: 22, leftAnkle: -30, rightHip: -24, rightKnee: 8, rightAnkle: 16, leftArm: -17, rightArm: 17 }, 0, [0, 3, -1]),
        key(.625, { leftHip: 10, leftKnee: 48, leftAnkle: -22, rightHip: -12, rightKnee: 20, rightAnkle: -8, leftArm: -10, rightArm: 10 }, -.016, [0,2,-.7]),
        key(.75, { leftHip: -12, leftKnee: 52, leftAnkle: -15, rightHip: 3, rightKnee: 6, rightAnkle: -9 }, .012, [0,0,0]),
        key(.875, { leftHip: -25, leftKnee: 20, leftAnkle: 5, rightHip: 15, rightKnee: 9, rightAnkle: -24, leftArm: 12, rightArm: -12 }, .006, [0,-2,.7]),
        key(1, { leftHip: -24, leftKnee: 8, leftAnkle: 16, rightHip: 20, rightKnee: 22, rightAnkle: -30, leftArm: 17, rightArm: -17 }, 0, [0, -3, 1]),
    ] },
    run: { duration: .68, loop: true, keys: [
        key(0, { torso: 6, head: -8, leftHip: -35, leftKnee: 18, leftAnkle: 7, rightHip: 25, rightKnee: 72, rightAnkle: -35, leftArm: 25, rightArm: -32, leftElbow: -86, rightElbow: -88 }, 0, [5,-4,1.5]),
        key(.125, { torso: 7, head: -9, leftHip: -12, leftKnee: 28, leftAnkle: -17, rightHip: 0, rightKnee: 112, rightAnkle: -20, leftArm: 15, rightArm: -22, leftElbow: -84, rightElbow: -90 }, -.01, [5,-2.5,1]),
        key(.25, { torso: 6, head: -8, leftHip: 20, leftKnee: 32, leftAnkle: -45, rightHip: -30, rightKnee: 115, rightAnkle: -25, leftArm: -4, rightArm: -4, leftElbow: -86, rightElbow: -86 }, .045, [5,0,0]),
        key(.375, { torso: 5, head: -7, leftHip: 26, leftKnee: 95, leftAnkle: -20, rightHip: -42, rightKnee: 38, rightAnkle: 15, leftArm: -25, rightArm: 20, leftElbow: -90, rightElbow: -84 }, .065, [5,2.5,-1]),
        key(.5, { torso: 6, head: -8, leftHip: 25, leftKnee: 72, leftAnkle: -35, rightHip: -35, rightKnee: 18, rightAnkle: 7, leftArm: -32, rightArm: 25, leftElbow: -88, rightElbow: -86 }, 0, [5,4,-1.5]),
        key(.625, { torso: 7, head: -9, leftHip: 0, leftKnee: 112, leftAnkle: -20, rightHip: -12, rightKnee: 28, rightAnkle: -17, leftArm: -22, rightArm: 15, leftElbow: -90, rightElbow: -84 }, -.01, [5,2.5,-1]),
        key(.75, { torso: 6, head: -8, leftHip: -30, leftKnee: 115, leftAnkle: -25, rightHip: 20, rightKnee: 32, rightAnkle: -45, leftArm: -4, rightArm: -4, leftElbow: -86, rightElbow: -86 }, .045, [5,0,0]),
        key(.875, { torso: 5, head: -7, leftHip: -42, leftKnee: 38, leftAnkle: 15, rightHip: 26, rightKnee: 95, rightAnkle: -20, leftArm: 20, rightArm: -25, leftElbow: -84, rightElbow: -90 }, .065, [5,-2.5,1]),
        key(1, { torso: 6, head: -8, leftHip: -35, leftKnee: 18, leftAnkle: 7, rightHip: 25, rightKnee: 72, rightAnkle: -35, leftArm: 25, rightArm: -32, leftElbow: -86, rightElbow: -88 }, 0, [5,-4,1.5]),
    ] },
    sit: { duration: 4, loop: true, keys: [key(0, s()), key(.5, s({ torso: 5, head: -4 })), key(1, s())] },
    standup: { duration: 1.1, keys: [key(0, s()), key(.18, s({ torso: 28, head: -15, leftArm: -45, rightArm: -45, leftElbow: -55, rightElbow: -55 })),
        key(.38, { torso: 25, head: -17, leftHip: -65, rightHip: -65, leftKnee: 104, rightKnee: 104, leftAnkle: -39, rightAnkle: -39, leftArm: -20, rightArm: -20, leftElbow: -25, rightElbow: -25 }),
        key(.65, { torso: 12, head: -8, leftHip: -24, rightHip: -24, leftKnee: 42, rightKnee: 42, leftAnkle: -18, rightAnkle: -18 }), key(.88, { torso: 2 }), key(1)] },
    crouch: { duration: 3.2, loop: true, keys: [key(0, { torso: 22, head: -18, leftHip: -68, rightHip: -68, leftKnee: 124, rightKnee: 124, leftAnkle: -56, rightAnkle: -56, leftArm: -38, rightArm: -38, leftElbow: -50, rightElbow: -50 }),
        key(.5, { torso: 23, head: -19, leftHip: -69, rightHip: -69, leftKnee: 125, rightKnee: 125, leftAnkle: -56, rightAnkle: -56, leftArm: -38, rightArm: -38, leftElbow: -50, rightElbow: -50 }),
        key(1, { torso: 22, head: -18, leftHip: -68, rightHip: -68, leftKnee: 124, rightKnee: 124, leftAnkle: -56, rightAnkle: -56, leftArm: -38, rightArm: -38, leftElbow: -50, rightElbow: -50 })] },
    crawl: { duration: 1.6, loop: true, contact: 'body', keys: [
        key(0, { torso: 72, head: -68, leftHip: -14, rightHip: 8, leftKnee: 92, rightKnee: 82, leftArm: -65, rightArm: -42, leftElbow: -18, rightElbow: -35, leftAnkle: -20, rightAnkle: -20 }, -.65, [0, 0, 2]),
        key(.25, { torso: 73, head: -68, leftHip: -4, rightHip: -2, leftKnee: 90, rightKnee: 92, leftArm: -53, rightArm: -54, leftElbow: -25, rightElbow: -25, leftAnkle: -20, rightAnkle: -20 }, -.65),
        key(.5, { torso: 72, head: -68, leftHip: 8, rightHip: -14, leftKnee: 82, rightKnee: 92, leftArm: -42, rightArm: -65, leftElbow: -35, rightElbow: -18, leftAnkle: -20, rightAnkle: -20 }, -.65, [0, 0, -2]),
        key(.75, { torso: 73, head: -68, leftHip: -2, rightHip: -4, leftKnee: 92, rightKnee: 90, leftArm: -54, rightArm: -53, leftElbow: -25, rightElbow: -25, leftAnkle: -20, rightAnkle: -20 }, -.65),
        key(1, { torso: 72, head: -68, leftHip: -14, rightHip: 8, leftKnee: 92, rightKnee: 82, leftArm: -65, rightArm: -42, leftElbow: -18, rightElbow: -35, leftAnkle: -20, rightAnkle: -20 }, -.65, [0, 0, 2]),
    ] },
    jump: { duration: 1.3, keys: [key(0), key(.16, { torso: 18, head: -10, leftHip: -48, rightHip: -48, leftKnee: 95, rightKnee: 95, leftAnkle: -47, rightAnkle: -47, leftArm: 30, rightArm: 30, leftElbow: -35, rightElbow: -35 }),
        key(.28, { torso: -5, leftArm: -95, rightArm: -95, leftElbow: -16, rightElbow: -16, leftHip: -10, rightHip: -10, leftKnee: 18, rightKnee: 18 }),
        key(.51, { torso: -6, head: 6, leftHip: -35, rightHip: -35, leftKnee: 65, rightKnee: 65, leftAnkle: -30, rightAnkle: -30, leftArm: -125, rightArm: -125, leftElbow: -20, rightElbow: -20 }, .65),
        key(.74, { leftHip: -10, rightHip: -10, leftKnee: 20, rightKnee: 20, leftArm: -45, rightArm: -45 }, .005),
        key(.83, { torso: 18, head: -12, leftHip: -34, rightHip: -34, leftKnee: 72, rightKnee: 72, leftAnkle: -38, rightAnkle: -38, leftArm: -20, rightArm: -20, leftElbow: -35, rightElbow: -35 }), key(1)] },
    lie: { duration: 4, contact: 'body', keys: [key(0, prone, -.9, [-90, 0, 0]), key(1, prone, -.9, [-90, 0, 0])] },
    fall: { duration: 2.4, contact: 'body', keys: [key(0), key(.15, { torso: -12, leftArm: -35, rightArm: -50, leftElbow: -35, rightElbow: -40, leftKnee: 20, rightKnee: 35 }, -.08, [-12, 0, 7]),
        key(.35, { torso: -18, head: 18, leftHip: -40, rightHip: -30, leftKnee: 55, rightKnee: 42, leftArm: [-55, 0, -35], rightArm: [-70, 0, 30], leftElbow: -25, rightElbow: -40 }, -.38, [-42, 0, 14]),
        key(.6, { ...prone, leftHip: -15, rightHip: -8, leftKnee: 35, rightKnee: 22, leftElbow: -25 }, -.83, [-80, 0, 5]), key(.8, prone, -.9, [-90, 0, 0]), key(1, prone, -.9, [-90, 0, 0])] },
    wave: { duration: 2, loop: true, keys: [key(0, { rightArm: [-80, -20, 90], rightElbow: [-85, 0, -5], leftElbow: -12, head: [0, 5, 0] }),
        key(.25, { rightArm: [-80, -12, 90], rightElbow: [-108, 0, 5], leftElbow: -12, head: [0, 5, 0] }),
        key(.5, { rightArm: [-80, -20, 90], rightElbow: [-85, 0, -5], leftElbow: -12, head: [0, 5, 0] }),
        key(.75, { rightArm: [-80, -12, 90], rightElbow: [-108, 0, 5], leftElbow: -12, head: [0, 5, 0] }), key(1, { rightArm: [-80, -20, 90], rightElbow: [-85, 0, -5], leftElbow: -12, head: [0, 5, 0] })] },
    point: { duration: 3, keys: [key(0), key(.18, { torso: [2, 7, 0], head: [0, 10, 0], rightArm: -78, rightElbow: -22 }),
        key(.35, { torso: [2, 9, 0], head: [0, 12, 0], rightArm: -90, rightElbow: -7 }), key(.84, { torso: [2, 9, 0], head: [0, 12, 0], rightArm: -90, rightElbow: -7 }), key(1, { torso: [2, 9, 0], head: [0, 12, 0], rightArm: -90, rightElbow: -7 })] },
    turn: { duration: 1.2, keys: [key(0), key(.22, { leftHip: -18, leftKnee: 28, leftAnkle: -10, rightHip: 5, head: [0, 22, 0] }, 0, [0, 24, 0]),
        key(.5, { rightHip: -18, rightKnee: 30, rightAnkle: -12, leftHip: 5, head: [0, 18, 0] }, 0, [0, 90, 0]),
        key(.76, { leftHip: -12, leftKnee: 18, rightHip: 3, head: [0, 5, 0] }, 0, [0, 158, 0]), key(1, {}, 0, [0, 180, 0])] },
    guard: { duration: 3, keys: [key(0, g()), key(1, g())] },
    punch: { duration: 1, keys: [key(0, g()), key(.22, g({ torso: [6, -16, 0], rightArm: [-34, 16, 14], rightElbow: -125 }), 0, [0, 8, 0]),
        key(.39, g({ torso: [7, 14, -3], rightArm: [-92, -8, 3], rightElbow: -8, leftArm: [-50, -10, -12] }), 0, [0, -10, 0]),
        key(.47, g({ torso: [7, 12, -2], rightArm: [-90, -6, 3], rightElbow: -14 }), 0, [0, -8, 0]),
        key(.7, g({ torso: [5, -3, 0], rightArm: [-50, 10, 10], rightElbow: -95 })), key(1, g())] },
    kick: { duration: 1.1, keys: [key(0, g()), key(.2, g({ rightHip: -55, rightKnee: 105, rightAnkle: -15, torso: -6 })),
        key(.39, g({ rightHip: -88, rightKnee: 10, rightAnkle: 70, torso: -12, leftArm: -52, rightArm: -26 })),
        key(.48, g({ rightHip: -84, rightKnee: 16, rightAnkle: 60, torso: -10 })), key(.72, g({ rightHip: -45, rightKnee: 100, rightAnkle: -18 })), key(1, g())] },
    roundhouse: { duration: 1.4, keys: [key(0, g()), key(.2, g({ rightHip: [-40, 20, 25], rightKnee: 100, torso: [0, 5, 0] }), 0, [0, -14, 0]),
        key(.39, g({ rightHip: [-74, -10, 40], rightKnee: 12, rightAnkle: 55, torso: [-8, 10, 0], head: [0, 15, 0], leftArm: -55, rightArm: -20 }), 0, [0, -50, -5]),
        key(.52, g({ rightHip: [-70, -18, 38], rightKnee: 22, rightAnkle: 40, torso: [-6, 10, 0], head: [0, 20, 0] }), 0, [0, -62, -4]),
        key(.74, g({ rightHip: [-35, 10, 20], rightKnee: 98, rightAnkle: -20 }), 0, [0, -32, 0]), key(1, g())] },
    'flying-kick': { duration: 1.5, keys: [key(0, g()), key(.18, g({ leftHip: -42, rightHip: -45, leftKnee: 88, rightKnee: 96, leftAnkle: -46, rightAnkle: -51, torso: 16 })),
        key(.3, g({ rightHip: -60, rightKnee: 110, leftHip: -35, leftKnee: 90, torso: -4 }), .12),
        key(.47, g({ rightHip: -90, rightKnee: 8, rightAnkle: 65, leftHip: -30, leftKnee: 110, torso: -10, leftArm: -55, rightArm: -28 }), .5),
        key(.63, g({ rightHip: -55, rightKnee: 95, leftHip: -20, leftKnee: 60, torso: -4 }), .17),
        key(.77, g({ leftHip: -44, rightHip: -48, leftKnee: 90, rightKnee: 100, leftAnkle: -46, rightAnkle: -52, torso: 17 })), key(1, g())] },
    dodge: { duration: .9, keys: [key(0, g()), key(.26, g({ torso: 20, head: -12, leftHip: -38, rightHip: -30, leftKnee: 72, rightKnee: 60, leftAnkle: -34, rightAnkle: -30 }), 0, [0, 0, -10]),
        key(.46, g({ torso: 26, head: -15, leftHip: -48, rightHip: -40, leftKnee: 88, rightKnee: 78, leftAnkle: -40, rightAnkle: -38 }), 0, [0, 0, -12]), key(.7, g({ torso: 12, leftHip: -26, rightHip: -20, leftKnee: 44, rightKnee: 35, leftAnkle: -18, rightAnkle: -15 }), 0, [0, 0, -5]), key(1, g())] },
    throw: { duration: 1.4, keys: [key(0), key(.2, { torso: [0, -18, 0], rightArm: [-130, 18, 18], rightElbow: -105, leftArm: -45, leftElbow: -25 }, 0, [0, 8, 0]),
        key(.4, { torso: [8, 14, -3], rightArm: [-105, -12, 6], rightElbow: -18, leftArm: -28, leftElbow: -35 }, 0, [0, -12, 0]),
        key(.55, { torso: [15, 22, -4], rightArm: [-52, -20, 2], rightElbow: -12, leftArm: -8, rightKnee: 18 }, 0, [0, -16, 0]), key(.78, { torso: [8, 8, 0], rightArm: -15, rightElbow: -25 }), key(1)] },
    push: { duration: 2.7, loop: true, keys: [key(0, { torso: 12, head: -8, leftArm: -74, rightArm: -74, leftElbow: -28, rightElbow: -28, leftHip: -15, rightHip: -10, leftKnee: 24, rightKnee: 20, leftAnkle: -9, rightAnkle: -10 }),
        key(.5, { torso: 18, head: -12, leftArm: -85, rightArm: -85, leftElbow: -10, rightElbow: -10, leftHip: -22, rightHip: -16, leftKnee: 35, rightKnee: 30, leftAnkle: -13, rightAnkle: -14 }),
        key(1, { torso: 12, head: -8, leftArm: -74, rightArm: -74, leftElbow: -28, rightElbow: -28, leftHip: -15, rightHip: -10, leftKnee: 24, rightKnee: 20, leftAnkle: -9, rightAnkle: -10 })] },
    stumble: { duration: .6, keys: [key(0), key(.23, { torso: -18, head: 10, leftArm: [-38, 0, -22], rightArm: [-50, 0, 25], leftElbow: -35, rightElbow: -28, leftHip: -26, rightHip: 12, leftKnee: 35, rightKnee: 22 }, 0, [0, -4, 9]),
        key(.5, { torso: 12, head: -8, leftHip: -15, rightHip: -30, leftKnee: 30, rightKnee: 48, leftArm: -20, rightArm: -15 }, 0, [0, 5, -5]), key(.78, { torso: 5, leftKnee: 14, rightKnee: 14 }), key(1)] },
    roll: { duration: 1.5, contact: 'body', keys: [key(0), key(.17, { torso: 32, head: 15, leftHip: -65, rightHip: -65, leftKnee: 120, rightKnee: 120, leftArm: -70, rightArm: -70, leftElbow: -70, rightElbow: -70 }, -.5),
        key(.34, { torso: 30, head: 20, leftHip: -85, rightHip: -85, leftKnee: 132, rightKnee: 132, leftArm: -80, rightArm: -80, leftElbow: -100, rightElbow: -100 }, -.65, [95, 0, 0]),
        key(.53, { torso: 30, head: 20, leftHip: -90, rightHip: -90, leftKnee: 132, rightKnee: 132, leftArm: -70, rightArm: -70, leftElbow: -100, rightElbow: -100 }, -.7, [200, 0, 0]),
        key(.74, { torso: 25, head: 5, leftHip: -70, rightHip: -70, leftKnee: 120, rightKnee: 120, leftArm: -40, rightArm: -40, leftElbow: -55, rightElbow: -55 }, -.5, [315, 0, 0]),
        key(.88, { torso: 12, leftHip: -30, rightHip: -30, leftKnee: 58, rightKnee: 58, leftAnkle: -28, rightAnkle: -28 }, -.2, [360, 0, 0]), key(1, {}, 0, [360, 0, 0])] },
};
const radians = T.MathUtils.degToRad;
const angles = (value: Angles | undefined): [number, number, number] => Array.isArray(value) ? value : [value ?? 0, 0, 0];
const rotationEuler = new T.Euler();
export function sampleAuthoredHumanAction(r: Rig, action: Action, local: number, progress: number) {
    const motion = AUTHORED_HUMAN_ACTIONS[action] ?? AUTHORED_HUMAN_ACTIONS.idle;
    const u = motion.loop ? ((local / motion.duration) % 1 + 1) % 1 : T.MathUtils.clamp(progress, 0, 1);
    const index = Math.max(1, motion.keys.findIndex(k => k.time >= u)), a = motion.keys[index - 1], b = motion.keys[index];
    const t = (u - a.time) / (b.time - a.time), span = b.time - a.time;
    const previous = motion.keys[index - 2] ?? (motion.loop ? { ...motion.keys.at(-2)!, time: motion.keys.at(-2)!.time - 1 } : a);
    const next = motion.keys[index + 1] ?? (motion.loop ? { ...motion.keys[1], time: motion.keys[1].time + 1 } : b);
    // Match velocity and acceleration at keys, retaining holds and purposeful impact timing.
    const interpolate = (vp: number, va: number, vb: number, vn: number) => {
        const before = previous.time === a.time ? 0 : (va - vp) / (a.time - previous.time), middle = (vb - va) / span;
        const after = next.time === b.time ? 0 : (vn - vb) / (next.time - b.time);
        return authoredCurve(va, vb, before, middle, after, span, t);
    };
    const rotation = (node: T.Object3D, name: string) => {
        const p = angles(previous.pose[name] ?? neutral[name]), va = angles(a.pose[name] ?? neutral[name]);
        const vb = angles(b.pose[name] ?? neutral[name]), n = angles(next.pose[name] ?? neutral[name]);
        rotationEuler.set(...va.map((v, i) => radians(interpolate(p[i], v, vb[i], n[i]))) as [number, number, number]);
        node.quaternion.setFromEuler(rotationEuler);
    };
    for (const [name, node] of Object.entries(r.joints)) rotation(node, name);
    // Preserve the intended full revolution of a forward roll rather than taking a quaternion shortcut.
    r.hips.rotation.set(...a.hips.map((v, i) => radians(interpolate(previous.hips[i], v, b.hips[i], next.hips[i]))) as [number, number, number]);
    const stature = (r.restHipHeight ?? .94) / .94, lift = interpolate(previous.lift, a.lift, b.lift, next.lift) * stature;
    r.hips.position.set(0, (r.restHipHeight ?? .94) + Math.min(0, lift), 0);
    if (motion.contact === 'body') supportHumanBody(r);
    else if (motion.contact !== 'none') supportHumanFeet(r, action === 'kick' || action === 'roundhouse' ? 'left' : undefined, true);
    // Aerial height is independent of bent knees; otherwise a tucked leg cancels the jump.
    r.hips.position.y += Math.max(0, lift);
    return true;
}
