import { Euler, Quaternion, Vector3 } from 'three';
import { clone, uid, type Entity, type Project, type Vec3 } from '../model.ts';
import { entityPosition } from '../timeline.ts';
import { syncStructureLinks } from './structure-links.ts';
import { assertEntityGroups, type EntityGroup } from './entity-groups.ts';

const vector = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every(n => typeof n === 'number' && Number.isFinite(n));
export interface GroupTransform { translation?: Vec3; rotation?: Vec3; pivot?: Vec3 }
export function groupPivot(project: Project, ids: string[], time = 0): Vec3 {
    const wanted = new Set(ids), members = project.entities.filter(e => wanted.has(e.id));
    if (!members.length) throw Error('没有可操作的对象');
    return members.reduce((sum, e) => sum.add(entityPosition(e, time)), new Vector3()).multiplyScalar(1 / members.length).toArray();
}
function membersOf(project: Project, ids: string[]) {
    const wanted = new Set(ids), members = project.entities.filter(e => wanted.has(e.id));
    if (!ids.length || wanted.size !== ids.length || members.length !== ids.length) throw Error('操作对象不存在或重复');
    return members;
}
/** Validate all dependencies before mutation. Call inside the existing editor transaction. */
export function transformEntities(project: Project, ids: string[], options: GroupTransform) {
    if (!options || Object.keys(options).some(k => !['translation', 'rotation', 'pivot'].includes(k))) throw Error('整体变换参数无效');
    for (const key of ['translation', 'rotation', 'pivot'] as const) if (options[key] !== undefined && !vector(options[key])) throw Error(`整体变换 ${key} 必须是三个有限数字`);
    const members = membersOf(project, ids), wanted = new Set(ids);
    for (const e of members) {
        if (e.locked) throw Error(`「${e.name}」已锁定，请先解锁`);
        const parent = e.handBinding?.actorId ?? e.structureLink?.parentId ?? (e.camera?.mode !== 'free' ? e.camera?.targetId : undefined);
        if (parent && !wanted.has(parent)) throw Error(`「${e.name}」依赖组外对象，请一起选择或先解除绑定`);
    }
    for (const e of project.entities) {
        const parent = e.handBinding?.actorId ?? e.structureLink?.parentId;
        if (parent && wanted.has(parent) && !wanted.has(e.id)) throw Error(`请同时选择关联对象「${e.name}」`);
    }
    const rotation = options.rotation ?? [0, 0, 0], q = new Quaternion().setFromEuler(new Euler(...rotation));
    const pivot = new Vector3(...(options.pivot ?? groupPivot(project, ids))), delta = new Vector3(...(options.translation ?? [0, 0, 0]));
    const move = (p: Vec3): Vec3 => new Vector3(...p).sub(pivot).applyQuaternion(q).add(pivot).add(delta).toArray();
    const rotating = rotation.some(v => v !== 0);
    for (const e of members) {
        // Bound members follow their parent once; offsets stay in the parent's local frame.
        if (e.handBinding || e.structureLink) continue;
        e.position = move(e.position); e.path?.points.forEach(p => p.position = move(p.position));
        if (rotating) {
            // Heading channels use yaw; avoid Euler X/Z flips for turns beyond 90 degrees.
            if ((e.kind === 'actor' || e.kind === 'crowd') && rotation[0] === 0 && rotation[2] === 0) e.rotation[1] += rotation[1];
            else {
                const r = new Euler().setFromQuaternion(q.clone().multiply(new Quaternion().setFromEuler(new Euler(...e.rotation))));
                e.rotation = [r.x, r.y, r.z];
            }
        }
        if (e.camera) {
            e.camera.target = move(e.camera.target);
            e.camera.targetPath?.points.forEach(p => p.position = move(p.position));
            if (rotating && e.camera.mode === 'follow' && !e.camera.inheritRotation) e.camera.offset = new Vector3(...e.camera.offset).applyQuaternion(q).toArray();
        }
        if (rotating && e.physics) {
            e.physics.velocity = new Vector3(...e.physics.velocity).applyQuaternion(q).toArray();
            e.physics.angularVelocity = new Vector3(...e.physics.angularVelocity).applyQuaternion(q).toArray();
            e.physics.impulses.forEach(i => { i.impulse = new Vector3(...i.impulse).applyQuaternion(q).toArray(); i.point = new Vector3(...i.point).applyQuaternion(q).toArray(); });
        }
    }
    syncStructureLinks(project);
}

/** Copy mutable instance data, retaining shared immutable resource IDs. */
export function duplicateEntities(project: Project, ids: string[], translation: Vec3 = [.4, 0, .4]) {
    if (!vector(translation)) throw Error('复制偏移必须是三个有限数字');
    const members = membersOf(project, ids), wanted = new Set(ids);
    for (const e of members) if (e.handBinding && !wanted.has(e.handBinding.actorId)) throw Error(`复制「${e.name}」时请包含持有者，或先解除手持绑定`);
    const mapping = new Map(ids.map(id => [id, uid()])), map = (id: string) => mapping.get(id) ?? id;
    const copies: Entity[] = members.map(source => {
        const e = clone(source); e.id = map(e.id); e.name += ' 副本'; e.locked = false;
        e.clips.forEach(c => c.id = uid()); e.faceTarget = map(e.faceTarget);
        if (e.handBinding) e.handBinding.actorId = map(e.handBinding.actorId);
        if (e.structureLink) { if (wanted.has(e.structureLink.parentId)) e.structureLink.parentId = map(e.structureLink.parentId); else e.structureLink = null; }
        if (e.camera) {
            e.camera.targetId = map(e.camera.targetId);
            if (e.camera.effects?.focusTargetId) e.camera.effects.focusTargetId = map(e.camera.effects.focusTargetId);
            if (e.camera.hiddenEntityIds) e.camera.hiddenEntityIds = e.camera.hiddenEntityIds.map(map);
        }
        if (e.visual?.cameraId) e.visual.cameraId = map(e.visual.cameraId);
        if (e.field) e.field.targets = e.field.targets.map(map);
        return e;
    });
    // Validate placement in a candidate before appending, so a bad dependency leaves no partial copy.
    const candidate = { ...project, entities: [...project.entities, ...copies] }, newIds = copies.map(e => e.id);
    transformEntities(candidate, newIds, { translation });
    project.entities.push(...copies);
    return { entityIds: newIds, mapping };
}

export function editGroup(project: Project, id: string, name: string | undefined, input: Record<string, unknown> | undefined) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('group.patch 必须提供 action');
    const action = input.action;
    const allowed = action === 'create' ? ['action', 'entityIds'] : action === 'transform' ? ['action', 'translation', 'rotation', 'pivot'] : action === 'duplicate' ? ['action', 'translation', 'newId'] : ['action'];
    if (Object.keys(input).some(k => !allowed.includes(k))) throw Error('不支持的编组参数');
    const group = project.groups?.find(g => g.id === id);
    if (action === 'create') {
        if (group) throw Error('编组 ID 已存在');
        const next: EntityGroup = { id: id || uid(), name: name ?? '新编组', entityIds: clone(input.entityIds) as string[] };
        const groups = [...(project.groups ?? []), next]; assertEntityGroups({ ...project, groups }); project.groups = groups;
    } else {
        if (!group) throw Error('编组不存在');
        if (action === 'remove') project.groups = project.groups!.filter(g => g !== group);
        else if (action === 'rename') {
            const groups = project.groups!.map(g => g === group ? { ...g, name: name ?? '' } : g);
            assertEntityGroups({ ...project, groups }); project.groups = groups;
        } else if (action === 'transform') {
            const { action: _action, ...transform } = input; transformEntities(project, group.entityIds, transform as GroupTransform);
        } else if (action === 'duplicate') {
            const newId = input.newId === undefined ? uid() : input.newId as string;
            const proposed = { id: newId, name: name ?? group.name + ' 副本', entityIds: group.entityIds };
            assertEntityGroups({ ...project, groups: [proposed] });
            if (project.groups!.some(g => g.id === newId)) throw Error('新编组 ID 已存在');
            const result = duplicateEntities(project, group.entityIds, input.translation as Vec3 | undefined);
            project.groups!.push({ ...proposed, entityIds: result.entityIds });
        } else throw Error('未知编组操作');
    }
}
