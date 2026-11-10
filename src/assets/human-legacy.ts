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
    rebaseHumanSurface(surfaces.torso(torso,skin,.38,e.gender==='female'?.157:.174,e.gender==='female'?.117:.13,.106),new T.Vector3(0,.105,0),new T.Vector3(.133,.19,.092));
    humanSurfaceSlot(torso,new T.Vector3(0,.255,0),new T.Vector3(e.gender==='female'?.157:.174,.18,.106));
    const neck = cylinder(torso, skin, .046, .058, .12, 0, .432);
    neck.castShadow = true;
    const head = makeJoint('head', torso, 0, .49);
    rebaseHumanSurface(surfaces.head(head,skin,.11),new T.Vector3(0,.105,.006),new T.Vector3(.095,.115,.094));
    humanSurfaceSlot(head,new T.Vector3(0,.045,.028),new T.Vector3(.077,.055,.076));
    // A small nose establishes facing direction without facial expression detail.
    sphere(head, skin, 0, .086, .084, .014, .020, .020);
    for (const side of ['left', 'right']) {
        const sign = side === 'left' ? -1 : 1;
        const arm = makeJoint(`${side}Arm`, torso, sign * (e.gender === 'female' ? .165 : .188), .31);
        surfaces.joint(arm,skin,.047);
        const upper=surfaces.bodyLimb(arm,skin,'arm',.285,.057,.037,1.06);upper.position.y=-.135;upper.rotation.z=sign*.04;
        const elbow = makeJoint(`${side}Elbow`, arm, 0, -.285);
        surfaces.joint(elbow,skin,.036);
        surfaces.bodyLimb(elbow,skin,'forearm',.24,.041,.026,1.04).position.y=-.116;
        rebaseHumanSurface(surfaces.hand(elbow,skin,.24),new T.Vector3(0,-.277,.01),new T.Vector3(.033,.065,.023));
        const hip = makeJoint(`${side}Hip`, hips, sign * .09, -.015);
        surfaces.bodyLimb(hip,skin,'thigh',.43,.085,.052,1.12).position.y=-.21;
        humanSurfaceSlot(hip,new T.Vector3(0,-.04,0),new T.Vector3(.078,.11,.079));
        const knee = makeJoint(`${side}Knee`, hip, 0, -.43);
        surfaces.joint(knee,skin,.049);
        surfaces.bodyLimb(knee,skin,'calf',.458,.06,.032,1.10).position.y=-.215;
        humanSurfaceSlot(knee,new T.Vector3(0,-.16,-.012),new T.Vector3(.055,.14,.057));
        sphere(knee, skin, 0, -.424, 0, .028, .03, .029);
        const ankle=makeJoint(`${side}Ankle`,knee,0,-.458);
        surfaces.foot(ankle,skin,.05);
    }
    for(const side of ['left','right']){
        const sign=side==='left'?-1:1,ear=surfaces.joint(head,skin,1);ear.position.set(sign*.076,.101,-.003);ear.scale.set(.011,.025,.017);ear.userData.directorPoseHelper=true;
        const thumb=surfaces.joint(joints[side+'Elbow'],skin,1);thumb.position.set(-sign*.031,-.292,.015);thumb.scale.set(.014,.032,.015);thumb.rotation.z=sign*.35;thumb.userData.directorPoseHelper=true;
    }
    scaleLegacyHuman(root, e);
    return { root, hips, joints, skin, head, jointSkin: jointMat };
}
export function scaleLegacyHuman(root: T.Group, e: Pick<Entity, 'height' | 'build'>) {
    const build = e.build === 'slim' ? .87 : e.build === 'broad' ? 1.2 : 1;
    root.scale.set(e.height / 1.75 * build, e.height / 1.75, e.height / 1.75);
}
