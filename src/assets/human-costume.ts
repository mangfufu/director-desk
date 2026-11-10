import * as T from 'three';
import type {Rig} from './human-legacy.ts';
import type {HumanProportions} from './catalog/humans.ts';
import {box,cylinder,mesh} from './geometry.ts';
import {humanSurfaces} from './human-surfaces.ts';
import {humanAnatomy,humanBodyDimensions,type HumanAnatomy} from './human-anatomy.ts';
import {addHumanSkirt} from './human-garment.ts';

/** Retain the original transform paths used by saved continuation poses. New surfaces
 * follow joints directly and are excluded from pose snapshots. Reserve all slots first. */
export function reserveHumanCostumeSlots(r:Rig,outfits:NonNullable<HumanProportions['outfit']>[]){
    const slot=(parent:T.Object3D,count=1)=>{for(let i=0;i<count;i++)parent.add(new T.Group());};
    for(const outfit of outfits){
        if(['casual','robe','armor','uniform'].includes(outfit)){slot(r.joints.torso);for(const side of ['left','right'])slot(r.joints[side+'Arm'],outfit==='armor'?2:1);}
        if(outfit==='dress'||outfit==='robe'){slot(r.joints.leftHip);slot(r.joints.rightHip);if(outfit==='dress')slot(r.joints.torso);}
        if(outfit==='uniform'){slot(r.joints.torso,2);slot(r.hips);}
        if(outfit==='helmet'||outfit==='hat')slot(r.head,2);
        if(outfit==='backpack')slot(r.joints.torso,4);
    }
}

/** Clothes are shaped around the body; attachment keeps existing actions editable. */
export function addHumanCostume(r:Rig,p:HumanProportions,lengthRatio=1,thickness=1,a:HumanAnatomy=humanAnatomy({asset:'human-adult',gender:'male'})){
    if(!p.outfit)return;
    const existing=new Set<T.Object3D>();r.root.traverse(o=>existing.add(o));
    const {head,hips,joints,skin}=r,torso=joints.torso,s=humanSurfaces(),d=humanBodyDimensions(p,a),g=Math.sqrt(p.girth),h=p.torso;
    const outfit=p.outfit,armor=outfit==='armor',robe=outfit==='robe',uniform=outfit==='uniform',casual=outfit==='casual';
    const shell=casual||robe||armor||uniform||outfit==='dress',padding=armor?.022:casual?.018:.012;
    if(shell){
        s.surface(torso,skin,[[-.07,0,0],[-.055,Math.max(d.hip*.96,d.waist)+padding,d.depth*.9+padding],
            [h*.12,d.abdomen+padding,d.depth*.94+padding,a.belly*.7],[h*.29,d.waist+padding,d.depth*.89+padding,a.belly],
            [h*.53,d.chest*.96+padding,d.depth*1.04+padding,.009],[h*.69,d.chest+padding,d.depth+padding,.009],
            [h*.83,p.shoulder*.88+padding,d.depth*.86+padding],[h*.94,p.shoulder*.64+padding,d.depth*.63+padding],
            [h+.01,.052*a.neck,.053*a.neck]],16,2,armor?.68:1);
        if(outfit!=='dress')for(const side of ['left','right']){
            const arm=joints[side+'Arm'],elbow=joints[side+'Elbow'];
            const total=(casual?p.upperArm*.58:p.upperArm+p.forearm)*lengthRatio,upper=Math.min(p.upperArm,total),lower=Math.max(0,total-p.upperArm);
            s.limb(arm,skin,upper,.061*g*a.arm+padding,.042*Math.pow(p.girth,.25)+padding,1.12);
            if(lower>.01){
                s.limb(elbow,skin,lower,.046*g*a.arm+padding,.027*Math.pow(p.girth,.25)+padding,1.12);
                cylinder(elbow,skin,.033*Math.pow(p.girth,.25)+padding,.035*Math.pow(p.girth,.25)+padding,.035,0,-lower+.015);
            }
        }
        if(casual||uniform)for(const side of ['left','right']){
            s.limb(joints[side+'Hip'],skin,p.thigh,.086*g*a.leg+.012,.052*Math.pow(p.girth,.25)+.012,1.18);
            s.limb(joints[side+'Knee'],skin,p.shin,.058*g*a.leg+.012,.04*Math.pow(p.girth,.25)+.006,1.15);
        }
    }
    if(outfit==='dress'||robe)addHumanSkirt(r,p,a,lengthRatio);
    if(uniform||robe||armor){
        cylinder(torso,skin,.057*a.neck,.063*a.neck,uniform?.055:.035,0,h+.018);
        s.surface(hips,skin,[[.045,d.hip+.025,d.hipDepth+.025],[.08,d.hip+.025,d.hipDepth+.025]],16,1,.7);
    }
    if(uniform){
        for(const sign of [-1,1]){
            const lapel=box(torso,skin,.055,h*.20,.018,sign*p.shoulder*.24,h*.83,d.depth*.90+.025,.003);lapel.rotation.z=sign*.35;
            box(torso,skin,p.shoulder*.40,h*.19,.024,sign*p.shoulder*.47,h*.55,d.depth*1.04+.026,.004);
            box(torso,skin,p.shoulder*.51,.018,.065,sign*p.shoulder*.64,h*.88,0,.003);
        }
        box(torso,skin,.018,h*.65,.018,0,h*.40,d.depth+.028,.002);
    }
    if(robe){
        for(const sign of [-1,1]){const lapel=box(torso,skin,.035,h*.85,.016,sign*.048,h*.52,d.depth+padding+.012,.003);lapel.rotation.z=sign*.19;}
        box(hips,skin,.065,.10,.035,0,.06,d.hipDepth+.04,.004);
    }
    if(armor){
        s.surface(torso,skin,[[h*.34,d.chest*.92,d.depth+padding+.018],[h*.52,d.chest+padding,d.depth+padding+.03],
            [h*.73,d.chest+padding,d.depth+padding+.02],[h*.85,d.chest*.8,d.depth*.9+padding]],12,2,.6);
        for(const side of ['left','right']){
            const sign=side==='left'?-1:1;
            const pauldron=box(joints[side+'Arm'],skin,.16*g,.125,.19*g,sign*.015,-.018,0,.024);pauldron.rotation.z=sign*.13;
            box(joints[side+'Elbow'],skin,.09*g,p.forearm*.65,.065,0,-p.forearm*.55,.055*g,.012);
            box(joints[side+'Knee'],skin,.11*g,.105,.065,0,0,.055*g,.015);
            box(joints[side+'Knee'],skin,.085*g,p.shin*.67,.065,0,-p.shin*.45,.045*g,.01);
            box(joints[side+'Hip'],skin,.13*g,p.thigh*.32,.045,0,-p.thigh*.15,.10*g,.008);
        }
    }
    if(outfit==='helmet'){
        const helmet=mesh(head,new T.SphereGeometry(1,20,12,0,Math.PI*2,0,Math.PI*.60),skin,0,p.head*1.26,0);
        helmet.scale.set(p.head*.80*a.headWidth,p.head*.85,p.head*.89);
        cylinder(head,skin,p.head*.82,p.head*.82,.025,0,p.head*1.10);
        for(const sign of [-1,1])box(head,skin,.03,p.head*.55,p.head*.48,sign*p.head*.71*a.headWidth,p.head*.94,-p.head*.10,.008);
    }
    if(outfit==='hat'){
        const brim=cylinder(head,skin,p.head*1.52,p.head*1.52,.022,0,p.head*1.69);brim.scale.z=.86;
        cylinder(head,skin,p.head*.63,p.head*.75,p.head*.63,0,p.head*1.99);
        cylinder(head,skin,p.head*.76,p.head*.76,.026,0,p.head*1.74);
    }
    if(outfit==='backpack'){
        const back=d.depth+.105;
        box(torso,skin,p.shoulder*1.45,h*.78,.18*g,0,h*.46,-back,.035);
        box(torso,skin,p.shoulder*1.15,h*.32,.055*g,0,h*.25,-back-.105*g,.02);
        for(const sign of [-1,1]){
            box(torso,skin,.035,h*.77,.025,sign*p.shoulder*.55,h*.47,d.depth+.025,.006);
            box(torso,skin,.035,.035,d.depth*2+.12,sign*p.shoulder*.55,h*.87,-.02,.006);
        }
    }
    r.root.traverse(object=>{
        if(existing.has(object)||!(object instanceof T.Mesh))return;
        object.userData.costume=outfit;
        object.userData.directorPoseHelper=true;
        if(thickness!==1){object.geometry=object.geometry.clone();object.geometry.computeBoundingBox();
            const size=object.geometry.boundingBox!.getSize(new T.Vector3()),padding=.01*(thickness-1);
            object.geometry.scale(1+2*padding/Math.max(.025,size.x),1,1+2*padding/Math.max(.025,size.z));
        }
    });
}
