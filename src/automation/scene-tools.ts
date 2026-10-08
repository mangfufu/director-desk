import { createScene, SCENE_TEMPLATES, type SceneTemplate } from '../scenes.ts';
import { addDocumentScene, duplicateDocumentScene, readSceneDocument, removeDocumentScene, renameDocumentScene, reorderDocumentScenes, switchDocumentScene, type SceneDocument } from '../scenes/sequence-project.ts';
export { readIndependentScene } from '../scenes/scene-query.ts';

export function editIndependentScene(document: SceneDocument, args: Record<string, unknown>) {
    const id = String(args.sceneId ?? document.activeSceneId), name = String(args.name ?? ''), nextId = args.newSceneId as string | undefined;
    switch (args.action) {
        case 'new-project': {
            const template = String(args.template ?? 'blank'); if (!SCENE_TEMPLATES.some(t => t.id === template)) throw Error('未知场景模板');
            const project = createScene(template as SceneTemplate); if (name) project.name = name;
            return readSceneDocument(project);
        }
        case 'switch': return switchDocumentScene(document, id);
        case 'copy': return duplicateDocumentScene(document, id, name, nextId);
        case 'rename': return renameDocumentScene(document, id, name);
        case 'remove': return removeDocumentScene(document, id);
        case 'reorder': return reorderDocumentScenes(document, args.sceneIds as string[]);
        case 'create': {
            const template = String(args.template ?? 'blank'); if (!SCENE_TEMPLATES.some(t => t.id === template)) throw Error('未知场景模板');
            return addDocumentScene(document, createScene(template as SceneTemplate), name, nextId);
        }
        default: throw Error('未知戏段编辑操作');
    }
}
