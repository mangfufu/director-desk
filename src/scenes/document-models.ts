import type { SceneModels } from '../resources/scene-models.ts';
import { assertSceneDocument, projectForOrigin, projectForScene, type SceneDocument } from './sequence-project.ts';

/** Validate bindings in inactive scenes too, before replacing a user's document. */
export async function prepareDocumentModels(models: SceneModels, document: SceneDocument, signal?: AbortSignal) {
    assertSceneDocument(document);
    for (const scene of document.scenes) {
        signal?.throwIfAborted();
        const project = projectForScene(document, scene.id); await models.prepare(project, signal); models.assertReady(project);
        if (scene.origin) { const origin = projectForOrigin(document, scene.id); await models.prepare(origin, signal); models.assertReady(origin); }
    }
}
