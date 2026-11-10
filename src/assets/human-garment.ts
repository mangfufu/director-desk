import * as T from 'three';
import type {Rig} from './human-legacy.ts';
import type {HumanProportions} from './catalog/humans.ts';
import type {HumanAnatomy} from './human-anatomy.ts';
import {humanBodyDimensions} from './human-anatomy.ts';
import {humanSurfaces} from './human-surfaces.ts';

/** A continuous hem, driven by the existing hips, thighs and knees. */
export function addHumanSkirt(r:Rig,p:HumanProportions,a:HumanAnatomy,lengthRatio:number){
    const d=humanBodyDimensions(p,a),g=Math.sqrt(p.girth),length=(p.thigh+p.shin)*.90*lengthRatio;
    const top=.10,width=Math.max(d.hip+.018,p.pelvis+.09*g),hem=width*(p.outfit==='robe'?1.23:1.47),depth=Math.max(d.hipDepth+.025,.13*p.girth);
    const surface=humanSurfaces().surface(r.hips,r.skin,[
        [top-length,hem,depth*1.38],[top-length*.97,hem,depth*1.38],
        [top-length*.55,width*1.14,depth*1.15],[top-length*.20,width*1.04,depth],[top,width*.95,depth*.92],
    ],24,3,1);
    const geometry=surface.geometry;surface.removeFromParent();
    const joints=[r.hips,r.joints.leftHip,r.joints.rightHip,r.joints.leftKnee,r.joints.rightKnee];
    const bones=joints.map(parent=>{const bone=new T.Bone();bone.userData.directorPoseHelper=true;parent.add(bone);return bone;});
    const positions=geometry.getAttribute('position'),indices:number[]=[],weights:number[]=[];
    for(let i=0;i<positions.count;i++){
        const down=top-positions.getY(i),along=T.MathUtils.clamp(down/length,0,1);
        const legs=T.MathUtils.smoothstep(along,0,.36),knees=T.MathUtils.smoothstep(down,p.thigh*.65,p.thigh*1.2)*.72;
        const right=T.MathUtils.clamp(.5+positions.getX(i)/(width*1.6),0,1);
        const values=[1-legs,legs*(1-knees)*(1-right),legs*(1-knees)*right,legs*knees*(1-right),legs*knees*right];
        const largest=values.map((weight,index)=>({weight,index})).sort((x,y)=>y.weight-x.weight).slice(0,4),sum=largest.reduce((n,v)=>n+v.weight,0);
        indices.push(...largest.map(v=>v.index));weights.push(...largest.map(v=>v.weight/sum));
    }
    geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(indices,4));geometry.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));
    const garment=new T.SkinnedMesh(geometry,r.skin);garment.name='continuous-hem';garment.userData.garmentHem=true;
    garment.castShadow=true;garment.receiveShadow=true;garment.frustumCulled=false;r.hips.add(garment);
    r.root.updateMatrixWorld(true);garment.bind(new T.Skeleton(bones));return garment;
}
