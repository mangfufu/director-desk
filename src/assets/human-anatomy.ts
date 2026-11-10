import type {Entity} from '../model.ts';
import type {HumanProportions} from './catalog/humans.ts';

/** Shape controls independent of the animation rig and its joint names. */
export interface HumanAnatomy {
    chest:number; waist:number; abdomen:number; depth:number; belly:number;
    hip:number; hipDepth:number; arm:number; leg:number; neck:number; headWidth:number;
}
const neutral:HumanAnatomy={chest:1,waist:1,abdomen:1,depth:1,belly:0,hip:1,hipDepth:1,arm:1,leg:1,neck:1,headWidth:1};
const shapes:Record<string,Partial<HumanAnatomy>>={
    'human-child':{chest:.94,waist:1.12,abdomen:1.08,depth:.93,arm:.84,leg:.85,neck:.76,headWidth:1.08},
    'human-teen':{chest:.95,waist:.94,depth:.9,arm:.86,leg:.9,neck:.86},
    'human-elder':{chest:.94,waist:1.08,abdomen:1.13,belly:.012,arm:.84,leg:.9,neck:.87},
    'human-slender':{chest:.95,waist:.86,abdomen:.88,depth:.88,arm:.86,leg:.9,neck:.84,headWidth:.94},
    'human-muscular':{chest:1.12,waist:.82,abdomen:.9,depth:1.13,arm:1.18,leg:1.12,neck:1.18},
    'human-full':{chest:1.06,waist:1.16,abdomen:1.24,depth:1.13,belly:.04,hip:1.07,hipDepth:1.14,arm:1.04,leg:1.08,neck:1.12},
    'human-giant':{chest:1.07,waist:.95,arm:1.1,leg:1.08,neck:1.15},
    'human-heavy-giant':{chest:1.12,waist:1.03,abdomen:1.08,belly:.025,arm:1.15,leg:1.12,neck:1.3},
    'human-dwarf':{chest:1.05,waist:1.06,depth:1.1,arm:1.08,leg:1.12,neck:1.1,headWidth:1.08},
    'human-longlimb':{waist:.9,arm:.83,leg:.87,neck:.9,headWidth:.93},
    'human-elf':{waist:.88,depth:.92,arm:.88,leg:.92,neck:.86,headWidth:.9},
    'human-orc':{chest:1.1,waist:.94,depth:1.1,arm:1.2,leg:1.1,neck:1.35,headWidth:1.1},
    'human-skeleton':{hip:.78,hipDepth:.62,arm:.58,leg:.58,neck:.58},
};
export function humanAnatomy(e:Pick<Entity,'asset'|'gender'>):HumanAnatomy{
    const result={...neutral,...shapes[e.asset]};
    // Childhood has its own proportions; no adult chest treatment on children.
    if(e.gender==='female'&&e.asset!=='human-child'&&e.asset!=='human-skeleton'&&e.asset!=='human-robot'){
        result.waist*=.9;result.hip*=1.08;result.hipDepth*=1.06;result.arm*=.93;result.neck*=.9;
        if(e.asset!=='human-teen')result.chest*=1.025;
    }
    return result;
}
export function humanBodyDimensions(p:HumanProportions,a:HumanAnatomy){
    const girth=Math.sqrt(p.girth);
    return {chest:p.shoulder*.88*a.chest,waist:p.shoulder*.67*girth*a.waist,
        abdomen:p.shoulder*.69*girth*a.abdomen,depth:.108*p.girth*a.depth,
        hip:p.pelvis*1.72*a.hip,hipDepth:.112*girth*a.hipDepth};
}
