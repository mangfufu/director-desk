import { clone, type Project } from '../model.ts';
import { productionData } from './notes.ts';
import { assertProductionShape } from './validation.ts';

/** Top-level changes preserve other drafts/notes. Arrays still replace as a whole. */
export function patchProduction(project: Project, patch: Record<string, unknown> | undefined) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw Error('production 操作需要 patch');
    const allowed = new Set(['fixedPrompt', 'sceneReferenceIds', 'notes', 'promptText', 'textOnlyPrompt', 'promptMode']);
    for (const key of Object.keys(patch)) if (!allowed.has(key)) throw Error('未知制作资料字段：' + key);
    const next = { ...productionData(project), ...clone(patch) };
    assertProductionShape(next);
    project.production = next;
}
