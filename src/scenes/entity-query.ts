import { findAsset } from '../asset-catalog.ts';
import type { Entity, Kind } from '../model.ts';
import { ENTITY_PAGE_SIZE, MAX_ENTITY_PAGE_SIZE, type EntityQuery } from './query-contract.ts';

interface IndexedEntity {
    entity: Entity;
    order: number;
    category: string;
    terms: readonly [name: string, id: string, asset: string];
}

interface EntityIndex {
    revision?: number;
    entries: IndexedEntity[];
    byId: Map<string, IndexedEntity>;
    byName: Map<string, IndexedEntity[]>;
    byKind: Map<Kind, IndexedEntity[]>;
    byCategory: Map<string, IndexedEntity[]>;
}

const indexes = new WeakMap<readonly Entity[], EntityIndex>();

function categoryOf(entity: Entity) {
    if (entity.kind === 'camera') return '摄影机';
    if (entity.asset === 'external-model') return entity.kind === 'actor' ? '人物' : '导入模型';
    return findAsset(entity.asset)?.group ?? '其他';
}

function addToBucket<K>(buckets: Map<K, IndexedEntity[]>, key: K, entry: IndexedEntity) {
    const bucket = buckets.get(key);
    if (bucket) bucket.push(entry);
    else buckets.set(key, [entry]);
}

function indexSceneEntities(source: readonly Entity[], revision?: number) {
    const previous = revision === undefined ? undefined : indexes.get(source);
    if (previous && previous.revision === revision && previous.entries.length === source.length) return previous;

    const index: EntityIndex = {
        revision, entries: [], byId: new Map(), byName: new Map(), byKind: new Map(), byCategory: new Map(),
    };
    for (const [order, entity] of source.entries()) {
        const entry: IndexedEntity = {
            entity, order, category: categoryOf(entity),
            terms: [entity.name.trim().toLowerCase(), entity.id.toLowerCase(), entity.asset.toLowerCase()],
        };
        index.entries.push(entry);
        index.byId.set(entity.id, entry);
        addToBucket(index.byName, entry.terms[0], entry);
        addToBucket(index.byKind, entity.kind, entry);
        addToBucket(index.byCategory, entry.category, entry);
    }
    if (revision !== undefined) indexes.set(source, index);
    return index;
}

function matchingEntries(index: EntityIndex, { ids, entityName, query, kind, category }: EntityQuery) {
    const idFilter = ids && new Set(ids);
    const exactName = entityName?.trim().toLowerCase();
    const term = query?.trim().toLowerCase();
    const categoryName = category?.trim();
    if (!idFilter && exactName === undefined && !term && !kind && categoryName === undefined) return index.entries;

    const exactIds = idFilter && [...idFilter].map(id => index.byId.get(id)).filter(entry => entry !== undefined);
    const subsets = [
        exactIds,
        exactName !== undefined ? index.byName.get(exactName) ?? [] : undefined,
        kind !== undefined ? index.byKind.get(kind) ?? [] : undefined,
        categoryName !== undefined ? index.byCategory.get(categoryName) ?? [] : undefined,
    ];
    let candidates = index.entries;
    for (const subset of subsets) if (subset && subset.length <= candidates.length) candidates = subset;
    const matches = candidates.filter(({ entity, category, terms }) =>
        (!idFilter || idFilter.has(entity.id)) && (exactName === undefined || terms[0] === exactName)
        && (!kind || entity.kind === kind) && (categoryName === undefined || categoryName === category)
        && (!term || terms.some(value => value.includes(term))));
    if (candidates === exactIds) matches.sort((a, b) => a.order - b.order);
    return matches;
}

export function selectSceneEntities(source: readonly Entity[], options: EntityQuery,
    { revision, fullList = false }: { revision?: number; fullList?: boolean } = {}) {
    const { ids, entityName, query, kind, category, overview, offset, limit } = options;
    const from = offset ?? 0;
    const size = limit ?? ENTITY_PAGE_SIZE;
    if (!Number.isSafeInteger(from) || from < 0) throw Error('offset 必须是非负安全整数');
    if (!Number.isInteger(size) || size < 1 || size > MAX_ENTITY_PAGE_SIZE)
        throw Error(`limit 必须是 1—${MAX_ENTITY_PAGE_SIZE} 的整数`);

    const index = indexSceneEntities(source, revision);
    const pageRequested = [entityName, query, kind, category, offset, limit].some(value => value !== undefined);
    const unfiltered = !pageRequested && ids === undefined;
    const includeOverview = overview ?? (unfiltered && !fullList && !options.details && source.length > ENTITY_PAGE_SIZE);
    const categoriesOnly = includeOverview && unfiltered && source.length > ENTITY_PAGE_SIZE;
    const matches = matchingEntries(index, options);
    const paged = !categoriesOnly && (pageRequested || !fullList && matches.length > size);
    const page = paged ? matches.slice(from, from + size) : matches;
    const next = from + page.length;
    return {
        entities: categoriesOnly ? undefined : page.map(entry => entry.entity),
        ...(includeOverview ? { entityCategories: [...index.byCategory].map(([category, items]) => ({ category, count: items.length })) } : {}),
        ...(ids ? { missingIds: ids.filter(id => !index.byId.has(id)) } : {}),
        ...(paged ? { entityPage: { total: matches.length, offset: from, limit: size, nextOffset: next < matches.length ? next : null } } : {}),
    };
}
