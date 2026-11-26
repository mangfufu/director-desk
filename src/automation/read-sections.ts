import type { EntityQuery } from '../scenes/query-contract.ts';

export const READ_SECTIONS = ['entities', 'scene', 'cuts', 'production', 'references', 'resources', 'statistics', 'selection'] as const;
export type ReadSection = typeof READ_SECTIONS[number];
export type SceneReadOptions = EntityQuery & { resourceId?: string; sections?: (ReadSection | 'all')[] };
export { SAVED_SCENE_SECTIONS, type SavedSceneReadOptions } from '../scenes/query-contract.ts';
