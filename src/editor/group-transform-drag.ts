import { clone, type Project, type Vec3 } from '../model.ts';
import { transformEntities } from '../building/group-editing.ts';

/** Snapshot editable transforms once per gesture, never duplicate model/media payloads per pointer move. */
export function beginGroupDrag(project: Project, ids: string[], pivot: Vec3) {
    const selected = new Set(ids);
    const members = new Map(project.entities.filter(e => selected.has(e.id)).map(e => [e.id, e]));
    const initial = project.entities.filter(e => selected.has(e.id)).map(e => ({ id: e.id, position: clone(e.position), rotation: clone(e.rotation), path: clone(e.path), camera: clone(e.camera), structureLink: clone(e.structureLink), physics: clone(e.physics) }));
    // Validate locks and bindings before the first drag mutation.
    transformEntities(project, ids, { translation: [0, 0, 0] });
    return { apply(mode: string, position: Vec3, rotation: Vec3) {
        if (mode === 'scale') throw Error('请单独选择成员调整缩放');
        for (const start of initial) {
            const e = members.get(start.id)!;
            e.position = [...start.position]; e.rotation = [...start.rotation]; e.path = clone(start.path); e.camera = clone(start.camera);
            if (start.structureLink !== undefined) e.structureLink = clone(start.structureLink);
            if (start.physics !== undefined) e.physics = clone(start.physics);
        }
        transformEntities(project, ids, mode === 'translate' ? { translation: position.map((v, i) => v - pivot[i]) as Vec3, pivot }
            : { rotation, pivot });
    } };
}
