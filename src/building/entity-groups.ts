import type { Project } from '../model.ts';

/** Editing membership only; entities retain world-space transforms. */
export interface EntityGroup { id: string; name: string; entityIds: string[] }
export function assertEntityGroups(project: Project) {
    if (project.groups === undefined) return;
    if (!Array.isArray(project.groups) || project.groups.length > 10000) throw Error('编组列表无效');
    const ids = new Set<string>(), members = new Set<string>(), entities = new Set(project.entities.map(e => e.id));
    for (const group of project.groups) {
        if (!group || typeof group !== 'object' || Object.keys(group).some(k => !['id', 'name', 'entityIds'].includes(k))
            || typeof group.id !== 'string' || !/^[\p{L}\p{N}_:.-]{1,200}$/u.test(group.id) || ids.has(group.id)
            || typeof group.name !== 'string' || !group.name.trim() || group.name.length > 200
            || !Array.isArray(group.entityIds) || !group.entityIds.length || group.entityIds.length > project.entities.length) throw Error('编组名称、标识或成员无效');
        ids.add(group.id);
        for (const id of group.entityIds) {
            if (!entities.has(id) || members.has(id)) throw Error('编组成员不存在或重复；每个对象只能属于一个组');
            members.add(id);
        }
    }
}
export function removeGroupMember(project: Project, id: string) {
    if (!project.groups) return;
    project.groups = project.groups.map(g => ({ ...g, entityIds: g.entityIds.filter(member => member !== id) })).filter(g => g.entityIds.length);
}
export function groupForEntity(project: Project, id: string) { return project.groups?.find(g => g.entityIds.includes(id)); }
