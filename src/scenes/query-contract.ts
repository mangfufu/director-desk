export const SAVED_SCENE_SECTIONS = ['entities', 'scene', 'cuts', 'production', 'references', 'resources'] as const;
export type SavedSceneReadOptions = { ids?: string[]; details?: boolean; sections?: (typeof SAVED_SCENE_SECTIONS[number] | 'all')[] };
