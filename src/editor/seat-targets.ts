import type { Object3D } from 'three';
import type { Project } from '../model.ts';
import { entityVisibleAt } from '../scenes/visibility.ts';
import { worldContactAnchors } from '../assets/contact-anchors.ts';

export function seatTargets(project: Project, models: ReadonlyMap<string, Object3D>, time: number) {
    return project.entities.flatMap(entity => {
        const root = models.get(entity.id);
        if (entity.kind !== 'prop' || !entityVisibleAt(entity,time) || !root) return [];
        return worldContactAnchors(entity,root)
            .filter(anchor => ['seat','bed'].includes(anchor.role) && anchor.normal[1] > .98)
            .map((anchor,index)=>({id:JSON.stringify([entity.id,anchor.id]),name:`${entity.name} ${index+1}`}));
    });
}
