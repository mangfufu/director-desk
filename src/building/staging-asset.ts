import { assertProject, clone, entity, uid, type Project, type Vec3 } from '../model.ts';
import { groupPivot, transformEntities } from './group-editing.ts';
import { mergeScene } from '../scenes/merge-project.ts';

export interface StagingAsset {
    format: 'director-staging'; version: 1; id: string; name: string; updated: number;
    entityIds: string[]; scene: Project;
    /** Keeps the existing portable project validator; this support camera is never inserted. */
    supportCameraId?: string;
}
const nameValid = (name: unknown): name is string => typeof name === 'string' && name.trim().length > 0 && name.length <= 200;
export function assertStagingAsset(input: unknown): asserts input is StagingAsset {
    const asset = input as StagingAsset;
    if (!asset || asset.format !== 'director-staging' || asset.version !== 1 || !nameValid(asset.name) || !nameValid(asset.id)
        || !Number.isFinite(asset.updated) || Object.keys(asset).some(k => !['format', 'version', 'id', 'name', 'updated', 'entityIds', 'scene', 'supportCameraId'].includes(k))) throw Error('布景文件格式无效');
    assertProject(asset.scene);
    if (!Array.isArray(asset.entityIds) || !asset.entityIds.length || new Set(asset.entityIds).size !== asset.entityIds.length) throw Error('布景成员无效');
    const ids = new Set(asset.entityIds);
    if (asset.supportCameraId !== undefined && (!asset.scene.entities.some(e => e.id === asset.supportCameraId && e.kind === 'camera') || ids.has(asset.supportCameraId))) throw Error('布景辅助机位无效');
    if (asset.entityIds.some(id => !asset.scene.entities.some(e => e.id === id)) || asset.scene.entities.some(e => !ids.has(e.id) && e.id !== asset.supportCameraId)) throw Error('布景对象与成员列表不一致');
    const support = asset.supportCameraId;
    if (support && asset.scene.groups?.some(g => g.entityIds.includes(support))) throw Error('布景辅助机位不能属于编组');
    if (support && asset.scene.entities.some(e => ids.has(e.id) && (e.camera?.targetId === support || e.camera?.effects?.focusTargetId === support || e.visual?.cameraId === support || e.faceTarget === support || e.field?.targets.includes(support)))) throw Error('布景不能依赖辅助机位');
}
export function stagingMetadata(asset: StagingAsset) {
    return { id: asset.id, name: asset.name, updated: asset.updated, count: asset.entityIds.length, models: asset.scene.resources?.length ?? 0, media: asset.scene.media?.length ?? 0 };
}
export type StagingMetadata = ReturnType<typeof stagingMetadata>;

/** Capture selected objects plus required referenced targets, not unrelated scene/script data. */
export function createStagingAsset(project: Project, ids: string[], name: string): StagingAsset {
    assertProject(project);
    if (!nameValid(name) || !Array.isArray(ids) || !ids.length) throw Error('请输入布景名称并选择对象');
    const members = new Set(ids), byId = new Map(project.entities.map(e => [e.id, e]));
    for (const id of members) {
        const e = byId.get(id); if (!e) throw Error('所选对象已不存在');
        for (const dependency of [e.handBinding?.actorId, e.structureLink?.parentId, e.camera?.targetId, e.camera?.effects?.focusTargetId, e.faceTarget, e.visual?.cameraId, ...(e.field?.targets ?? [])]) if (dependency) members.add(dependency);
    }
    const scene = clone(project); scene.name = name; scene.entities = scene.entities.filter(e => members.has(e.id));
    scene.entities.forEach(e => { if (e.camera?.hiddenEntityIds) e.camera.hiddenEntityIds = e.camera.hiddenEntityIds.filter(id => members.has(id)); });
    scene.groups = scene.groups?.map(g => ({ ...g, entityIds: g.entityIds.filter(id => members.has(id)) })).filter(g => g.entityIds.length);
    scene.floors = scene.floors?.filter(f => scene.entities.some(e => e.floorId === f.id));
    delete scene.extensions; delete scene.editorView; delete scene.zones; delete scene.production; delete scene.lighting; delete scene.depthVideo;
    scene.room.enabled = false; scene.references = scene.references.filter(r => scene.entities.some(e => e.reference === r.id));
    const modelIds = new Set(scene.entities.flatMap(e => [e.external?.resourceId, ...e.clips.map(c => c.retarget?.resourceId)].filter((id): id is string => !!id)));
    scene.resources = scene.resources?.filter(r => modelIds.has(r.id));
    const mediaIds = new Set(scene.entities.flatMap(e => e.surface?.layers.map(l => l.resourceId) ?? []));
    scene.media = scene.media?.filter(r => mediaIds.has(r.id));
    // Normalize around the reusable block's origin; preserve locked flags after capture.
    const pivot = groupPivot(scene, [...members]), locked = scene.entities.filter(e => e.locked).map(e => e.id);
    scene.entities.forEach(e => e.locked = false);
    transformEntities(scene, [...members], { translation: pivot.map(v => -v) as Vec3 });
    scene.entities.forEach(e => e.locked = locked.includes(e.id)); scene.floors?.forEach(f => f.elevation -= pivot[1]);
    let camera = scene.entities.find(e => e.camera), supportCameraId: string | undefined;
    if (!camera) { camera = entity('camera', 'camera', '布景格式辅助机位'); supportCameraId = camera.id; scene.entities.push(camera); }
    scene.cuts = [{ time: 0, cameraId: camera.id }];
    const asset: StagingAsset = { format: 'director-staging', version: 1, id: uid(), name, updated: Date.now(), entityIds: [...members], scene, ...(supportCameraId ? { supportCameraId } : {}) };
    assertStagingAsset(asset); return asset;
}
export function insertStagingAsset(destination: Project, asset: StagingAsset, position: Vec3 = [0, 0, 0]) {
    assertStagingAsset(asset);
    const result = mergeScene(destination, asset.scene, { offset: position, timeOffset: 0, scheduling: 'keep', cuts: 'keep' });
    if (asset.supportCameraId) {
        const helper = result.entityIds[asset.supportCameraId]; result.project.entities = result.project.entities.filter(e => e.id !== helper);
        result.addedIds = result.addedIds.filter(id => id !== helper); delete result.entityIds[asset.supportCameraId];
    }
    // A static module does not lengthen a short destination merely because its source scene was longer.
    const lastTime = (value: unknown): number => {
        if (!value || typeof value !== 'object') return 0;
        return Object.entries(value).reduce((end, [key, item]) => Math.max(end, (key === 'time' || key === 'end' || key==='start') && typeof item === 'number' && Number.isFinite(item) ? item : lastTime(item)), 0);
    };
    const added = new Set(result.addedIds);
    const scheduledEnd = result.project.entities.filter(e => added.has(e.id)).reduce((end, e) => Math.max(end, lastTime(e)), destination.duration);
    result.project.duration = scheduledEnd;
    assertProject(result.project); return result;
}
