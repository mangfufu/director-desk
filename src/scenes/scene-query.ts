import { clone } from '../model.ts';
import { memberPathSummary } from '../navigation/member-paths.ts';
import { inheritedPoseAt } from './initial-pose.ts';
import { productionData } from '../production/notes.ts';
import type { SceneDocument } from './sequence-project.ts';

import { SAVED_SCENE_SECTIONS, type SavedSceneReadOptions } from './query-contract.ts';
export type { SavedSceneReadOptions } from './query-contract.ts';

export function readIndependentScene(document: SceneDocument, id = document.activeSceneId, options: SavedSceneReadOptions = {}) {
    const scene = document.scenes.find(s => s.id === id); if (!scene) throw Error('戏段不存在');
    const project = { ...scene.state, name: document.name, resources: document.resources, media: document.media }; // Already validated session data; select before cloning.
    const requested = options.sections ?? ['entities'];
    const sections = new Set(requested.includes('all') ? SAVED_SCENE_SECTIONS : requested);
    const entities = project.entities.filter(e => !options.ids || options.ids.includes(e.id));
    return clone({ sceneId: id, sceneName: scene.name, active: id === document.activeSceneId, sections: [...sections],
        project: { name: project.name, duration: project.duration, fps: project.fps, aspect: project.aspect,
            creationMode: project.creationMode ?? 'full', referenceLabels: project.referenceLabels ?? false, entityCount: project.entities.length,
            ...(sections.has('scene') ? { room: project.room, extensions: project.extensions, lighting: project.lighting, physics: project.physics, depthVideo: project.depthVideo, floors: project.floors ?? [], zones: project.zones ?? [], groups: project.groups ?? [], editorView: project.editorView } : {}),
            ...(sections.has('cuts') ? { cuts: project.cuts } : {}),
            ...(sections.has('production') ? { production: clone(productionData(project)) } : {}),
            ...(sections.has('resources') ? { media: project.media?.map(({data:_data,...metadata})=>metadata), resources: project.resources?.map(({ package: _package, ...metadata }) => metadata) } : {}),
            ...(sections.has('references') ? { references: project.references.map(({ id, name }) => ({ id, name })) } : {}),
            ...(sections.has('entities') ? { entities: entities.map(e => options.details ? { ...clone(e), ...(e.initialPose ? { initialPose: { activeAtStart: inheritedPoseAt(e, 0), nodeCount: e.initialPose.nodes.length } } : {}) }
                : { id: e.id, name: e.name, asset: e.asset, kind: e.kind, color: e.color, reference: e.reference, position: e.position, visible: e.visible, locked: e.locked, ...(e.memberPaths ? {memberRoutes:memberPathSummary(e)} : {}) }),
                ...(options.ids ? { missingIds: options.ids.filter(id => !entities.some(e => e.id === id)) } : {}) } : {}) },
        origin: scene.origin ? { sceneId: scene.origin.sceneId, sceneName: scene.origin.sceneName, time: scene.origin.time, frameIndex: scene.origin.frameIndex } : null });
}
