import * as T from 'three';
import type { Entity } from '../model.ts';
import { humanShape } from './human-parameters.ts';
import { makeHuman as makeLegacyHuman, type Rig } from './human-legacy.ts';
import { material, sphere, cylinder } from './geometry.ts';
import { addHumanDetails } from './human-details.ts';
import { addHumanCostume,reserveHumanCostumeSlots } from './human-costume.ts';
import { humanSurfaces,rebaseHumanSurface,humanSurfaceSlot } from './human-surfaces.ts';
import {humanAnatomy,humanBodyDimensions} from './human-anatomy.ts';

export function makeHuman(e: Entity): Rig {
    const shape = humanShape(e);
    if (!shape) return makeLegacyHuman(e);
    const p = shape.proportions;
    const anatomy=humanAnatomy(e),body=humanBodyDimensions(p,anatomy);
    const root = new T.Group(), hips = new T.Group(); root.add(hips);
    const skin = material(e.color), jointSkin = material(new T.Color(e.color).multiplyScalar(.91));
    const surfaces=humanSurfaces(),girth=Math.sqrt(p.girth), extremity=Math.pow(p.girth,.25);
    const joints: Record<string, T.Group> = {};
    function joint(name: string, parent: T.Object3D, x: number, y: number, z = 0) {
        const g = new T.Group(); g.position.set(x, y, z); parent.add(g); joints[name] = g; return g;
    }
    const restHipHeight = p.thigh + p.shin + .037;
    hips.position.y = restHipHeight;
    const pelvisMesh=surfaces.surface(hips,skin,[[-.115,0,0],[-.085,body.hip*.65,body.hipDepth*.70,-.008],
        [-.035,body.hip*.94,body.hipDepth,-.012],[.035,body.hip,body.hipDepth,-.01],
        [.105,Math.max(body.waist,body.hip*.84),body.hipDepth*.87],[.15,body.waist*.86,body.hipDepth*.75],[.17,0,0]],16,3,1);
    rebaseHumanSurface(pelvisMesh,new T.Vector3(0,.02,0),new T.Vector3(p.pelvis*1.6,.12,.105*p.girth));
    const torso = joint('torso', hips, 0, .08);
    if(p.form!=='skeleton'){
        const {chest,waist,abdomen,depth}=body,h=p.torso;
        const torsoMesh=surfaces.surface(torso,skin,[
            [-.055,0,0],[-.035,Math.max(waist,body.hip*.85),depth*.83],
            [h*.12,abdomen,depth*.94,anatomy.belly*.7],[h*.29,waist,depth*.89,anatomy.belly],
            [h*.53,chest*.96,depth*1.04,.009],[h*.69,chest,depth,.009],
            [h*.83,p.shoulder*.87,depth*.85],[h*.93,p.shoulder*.64,depth*.62],
            [h+.01,.044*anatomy.neck,.045*anatomy.neck],[h+.025,0,0],
        ],16,3,.95);
        rebaseHumanSurface(torsoMesh,new T.Vector3(0,p.torso*.27,0),new T.Vector3(p.shoulder*.70,p.torso*.38,.10*p.girth));
        humanSurfaceSlot(torso,new T.Vector3(0,p.torso*.65,0),new T.Vector3(p.shoulder*.86,p.torso*.35,.11*p.girth));
    }
    cylinder(torso, skin, .043*anatomy.neck, .052*anatomy.neck, .09, 0, p.torso + .02);
    const head = joint('head', torso, 0, p.torso + .055);
    const u=p.head,w=u*anatomy.headWidth;
    const headMesh=surfaces.surface(head,skin,[[0,0,0],[u*.12,w*.34,u*.43,u*.10],
        [u*.34,w*.51,u*.61,u*.06],[u*.65,w*.64,u*.70],[u*.95,w*.67,u*.72],
        [u*1.27,w*.69,u*.76,-u*.045],[u*1.59,w*.61,u*.69,-u*.07],
        [u*1.85,w*.39,u*.48,-u*.04],[u*2,0,0]],16,3,1);
    rebaseHumanSurface(headMesh,new T.Vector3(0,p.head,0),new T.Vector3(p.head*.64,p.head,p.head*.66));
    sphere(head, skin, 0, p.head * .78, p.head * .76, p.head*.12, p.head*.18, p.head*.18);
    for (const side of ['left', 'right']) {
        const sign = side === 'left' ? -1 : 1;
        const arm = joint(`${side}Arm`, torso, sign * p.shoulder, p.torso * .86);
        surfaces.joint(arm,skin,.048*girth*anatomy.arm);
        surfaces.bodyLimb(arm,skin,'arm',p.upperArm,.061*girth*anatomy.arm,.035*extremity,1.10);
        const elbow = joint(`${side}Elbow`, arm, 0, -p.upperArm);
        surfaces.joint(elbow,skin,.034*girth);
        surfaces.bodyLimb(elbow,skin,'forearm',p.forearm,.046*girth*anatomy.arm,.025*extremity,1.08);
        const hand=surfaces.hand(elbow,skin,p.forearm);hand.geometry=hand.geometry.clone().scale(extremity,1,extremity);
        rebaseHumanSurface(hand,new T.Vector3(0,-p.forearm-.045,.012),new T.Vector3(.033,.057,.025));
        const hip = joint(`${side}Hip`, hips, sign * p.pelvis, 0);
        surfaces.bodyLimb(hip,skin,'thigh',p.thigh,.086*girth*anatomy.leg,.047*extremity,1.18);
        const knee = joint(`${side}Knee`, hip, 0, -p.thigh);
        surfaces.joint(knee,skin,.047*extremity);
        surfaces.bodyLimb(knee,skin,'calf',p.shin,.058*girth*anatomy.leg,.029*extremity,1.15);
        const ankle = joint(`${side}Ankle`, knee, 0, -p.shin);
        const foot=surfaces.foot(ankle,skin);foot.geometry.scale(extremity,1,extremity);
    }
    root.updateMatrixWorld(true);
    const referenceHeight = new T.Box3().setFromObject(root, true).max.y;
    const rig: Rig = { root, hips, joints, skin, jointSkin, head, referenceHeight, restHipHeight,
        headRestHeight: restHipHeight + .08 + p.torso + .055, legLengths: { upper: p.thigh, lower: p.shin } };
    addHumanDetails(rig,p);
    reserveHumanCostumeSlots(rig,shape.costumes);
    // Append details after historical slots so saved continuation poses remain valid.
    for(const side of ['left','right']){
        const sign=side==='left'?-1:1;
        if(!p.form){const ear=surfaces.joint(head,skin,1);ear.position.set(sign*w*.69,u*.92,-u*.03);ear.scale.set(u*.105,u*.23,u*.16);ear.userData.directorPoseHelper=true;}
        const thumb=surfaces.joint(joints[side+'Elbow'],skin,1);thumb.position.set(-sign*.031*extremity,-p.forearm-.052,.015);thumb.scale.set(.014*extremity,.032,.015*extremity);thumb.rotation.z=sign*.35;thumb.userData.directorPoseHelper=true;
    }
    for (const outfit of shape.costumes) addHumanCostume(rig, { ...p, outfit }, shape.length, shape.thickness,anatomy);
    scaleHuman(rig, e);
    return rig;
}

export function scaleHuman(rig: Rig, e: Entity) {
    const h = e.height / (rig.referenceHeight ?? 1.75);
    rig.root.scale.set(h * e.scale[0] * (e.build === 'slim' ? .87 : e.build === 'broad' ? 1.2 : 1), h * e.scale[1], h * e.scale[2]);
}
export function colorHuman(rig: Rig, color: string) {
    rig.skin.color.set(color);
    rig.jointSkin?.color.set(color).multiplyScalar(.91);
}
