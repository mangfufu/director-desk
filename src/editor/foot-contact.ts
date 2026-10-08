import * as T from 'three';
import type { Rig } from '../assets.ts';
import { FootGrounding } from '../animation/foot-grounding.ts';
const grounders = new WeakMap<Rig, FootGrounding>();
/** Two-bone sagittal leg solve. Targets are in rig units, so mannequin height is preserved. */
export function legAngles(down:number,forward:number,upper=.43,lower=.458) {
 const d=T.MathUtils.clamp(Math.hypot(down,forward),.03,upper+lower-.000001);
 return {hip:Math.atan2(-forward,down)-Math.acos(T.MathUtils.clamp((upper*upper+d*d-lower*lower)/(2*upper*d),-1,1)),knee:Math.PI-Math.acos(T.MathUtils.clamp((upper*upper+lower*lower-d*d)/(2*upper*lower),-1,1))};
}
export function fitFeetToSurface(r:Rig,surface:(x:number,y:number,z:number)=>number|null) {
    r.root.updateWorldMatrix(true,true);
    let grounder = grounders.get(r);
    if (!grounder) {
        const bones = { hips: r.hips, leftUpperLeg: r.joints.leftHip, leftLowerLeg: r.joints.leftKnee, leftFoot: r.joints.leftAnkle,
            rightUpperLeg: r.joints.rightHip, rightLowerLeg: r.joints.rightKnee, rightFoot: r.joints.rightAnkle };
        grounder = new FootGrounding({ frame: r.root, bones, resetReference() {} }); grounders.set(r, grounder);
    }
    const scale = r.root.getWorldScale(new T.Vector3()).y, origin = r.root.getWorldPosition(new T.Vector3()).y;
    grounder.apply({ mode: 'preventPenetration', maxCorrection: .55 * scale }, point => surface(point.x, origin + .55 * scale, point.z));
}
