// Preserve the legacy skeleton and dimensions for existing projects.
import * as T from 'three';
import type { Entity } from '../model.ts';
import { material, sphere, cylinder } from './geometry.ts';
import { humanSurfaces,rebaseHumanSurface,humanSurfaceSlot } from './human-surfaces.ts';
export interface Rig {
    poseAxes?: Record<string, 'x' | 'y' | 'z'>;
    poseSigns?: Record<string, number>;
    root: T.Group;
    hips: T.Group;
    joints: Record<string, T.Group>;
    skin: T.MeshStandardMaterial;
    head: T.Group;
    referenceHeight?: number;
    restHipHeight?: number;
    headRestHeight?: number;
    legLengths?: { upper: number; lower: number };
    jointSkin?: T.MeshStandardMaterial;
}
export function makeHuman(e: Entity): Rig {
    const root = new T.Group(), hips = new T.Group();
    root.add(hips);
    hips.position.y = .94;
    const skin = material(e.color), jointMat = material(new T.Color(e.color).multiplyScalar(.91));
    const surfaces=humanSurfaces();
    const joints: Record<string, T.Group> = {};
    const makeJoint = (name: string, parent: T.Object3D, x: number, y: number, z = 0) => { const g = new T.Group(); g.position.set(x, y, z); parent.add(g); joints[name] = g; return g; };
    rebaseHumanSurface(surfaces.pelvis(hips,skin,.155,.112),new T.Vector3(),new T.Vector3(.155,.12,.112));
    const torso = makeJoint('torso', hips, 0, .1);
    rebaseHumanSurface(surfaces.torso(torso,skin,.38,e.gender==='female'?.157:.174,.13,.106),new T.Vector3(0,.105,0),new T.Vector3(.133,.19,.092));
    humanSurfaceSlot(torso,new T.Vector3(0,.255,0),new T.Vector3(e.gender==='female'?.157:.174,.18,.106));
    const neck = cylinder(torso, skin, .046, .058, .12, 0, .432);
    neck.castShadow = true;
    const head = makeJoint('head', torso, 0, .49);
    sphere(head, skin, 0, .105, .006, .095, .115, .094);
    sphere(head, skin, 0, .045, .028, .077, .055, .076);
    // A small nose establishes facing direction without facial expression detail.
    sphere(head, skin, 0, .084, .096, .018, .026, .025);
    for (const side of ['left', 'right']) {
        const sign = side === 'left' ? -1 : 1;
        const arm = makeJoint(`${side}Arm`, torso, sign * (e.gender === 'female' ? .165 : .188), .31);
        surfaces.joint(arm,skin,.054);
        const upper=surfaces.limb(arm,skin,.285,.057,.039,.95);upper.position.y=-.135;upper.rotation.z=sign*.04;
        const elbow = makeJoint(`${side}Elbow`, arm, 0, -.285);
        surfaces.joint(elbow,skin,.036);
        surfaces.limb(elbow,skin,.24,.041,.027,.93).position.y=-.116;
        rebaseHumanSurface(surfaces.hand(elbow,skin,.24),new T.Vector3(0,-.277,.01),new T.Vector3(.033,.065,.023));
        const hip = makeJoint(`${side}Hip`, hips, sign * .09, -.015);
        surfaces.limb(hip,skin,.43,.085,.057,.96).position.y=-.21;
        humanSurfaceSlot(hip,new T.Vector3(0,-.04,0),new T.Vector3(.078,.11,.079));
        const knee = makeJoint(`${side}Knee`, hip, 0, -.43);
        surfaces.joint(knee,skin,.049);
        surfaces.limb(knee,skin,.458,.06,.032,1.03).position.y=-.215;
        humanSurfaceSlot(knee,new T.Vector3(0,-.16,-.012),new T.Vector3(.055,.14,.057));
        sphere(knee, skin, 0, -.424, 0, .028, .03, .029);
        const ankle=makeJoint(`${side}Ankle`,knee,0,-.458);
        surfaces.foot(ankle,skin,.05);
    }
    scaleLegacyHuman(root, e);
    return { root, hips, joints, skin, head, jointSkin: jointMat };
}
export function scaleLegacyHuman(root: T.Group, e: Pick<Entity, 'height' | 'build'>) {
    const build = e.build === 'slim' ? .87 : e.build === 'broad' ? 1.2 : 1;
    root.scale.set(e.height / 1.75 * build, e.height / 1.75, e.height / 1.75);
}
