import type { Kind } from '../model.ts';

export const ENTITY_QUERY_KINDS = ['actor', 'prop', 'camera', 'crowd'] as const satisfies readonly Kind[];
export const ENTITY_PAGE_SIZE = 32;
export const MAX_ENTITY_PAGE_SIZE = 100;
export type EntityQuery = {
    ids?: string[];
    details?: boolean;
    entityName?: string;
    query?: string;
    kind?: Kind;
    category?: string;
    overview?: boolean;
    offset?: number;
    limit?: number;
};

export const SAVED_SCENE_SECTIONS = ['entities', 'scene', 'cuts', 'production', 'references', 'resources'] as const;
export type SavedSceneReadOptions = EntityQuery & { sections?: (typeof SAVED_SCENE_SECTIONS[number] | 'all')[] };
