import { ASSETS, ASSET_GROUPS, assetJoints, searchAssets } from '../asset-catalog.ts';
import { ACTIONS, type Action } from '../model.ts';
import type { AssetDefinition } from './catalog/types.ts';
import { parameterDefaults } from '../parametric-props.ts';

export interface AssetQuery {
    query?: string;
    queries?: string[];
    group?: string;
    kind?: AssetDefinition['kind'];
    rig?: NonNullable<AssetDefinition['capabilities']>['rig'];
    action?: Action;
    ids?: string[];
    details?: boolean;
    offset?: number;
    limit?: number;
}
interface AssetSearch { query: string; group?: string; kind?: AssetDefinition['kind'] }
interface AssetSearches { searches: AssetSearch[]; limit?: number }
export type AssetCatalogQuery = AssetQuery | AssetSearches;

function capabilities(asset: AssetDefinition): NonNullable<AssetDefinition['capabilities']> {
    return asset.capabilities ?? (asset.kind === 'actor' || asset.kind === 'crowd'
        ? { rig: 'human-legacy', actions: Object.keys(ACTIONS) as Action[], pose: true, path: true }
        : { rig: 'none', actions: [], pose: false, path: true });
}
function checkLimit(limit: number) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('limit 必须是 1—50 的整数');
}
function checkGroup(group?: string) {
    if (group && group !== '全部' && !ASSET_GROUPS.includes(group)) throw Error('未知资产类别；可用 group：' + ASSET_GROUPS.join('、'));
}
function searchCatalog(input: AssetSearches, allowedIds?: readonly string[]) {
    const { searches, limit = 2 } = input;
    if (Object.keys(input).some(key => key !== 'searches' && key !== 'limit')) throw Error('searches 可搭配 limit，每项单独提供 query、group 或 kind。查详情用 ids 和 details');
    checkLimit(limit);
    if (!Array.isArray(searches) || searches.length < 1 || searches.length > 20) throw Error('searches 需要 1—20 项需求');
    const allowed = allowedIds ? new Set(allowedIds) : undefined;
    return { results: searches.map(({ query, group, kind }) => {
        if (typeof query !== 'string' || !query.trim()) throw Error('每项 searches.query 都需要名称或关键词');
        checkGroup(group);
        const matches = searchAssets(query, group || '全部', true).filter(asset =>
            (!allowed || allowed.has(asset.id)) && (!kind || asset.kind === kind));
        return { query, ...(group && { group }), ...(kind && { kind }), found: matches.length > 0, total: matches.length,
            assets: matches.slice(0, limit).map(({ id, name, group, kind }) => ({ id, name, group, kind })) };
    }) };
}
/** Serializable discovery without constructing meshes or loading a renderer. */
export function queryAssetCatalog(query: AssetQuery = {}, allowedIds?: readonly string[]) {
    const offset = query.offset ?? 0, limit = query.limit ?? 8;
    if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('offset 必须是非负安全整数');
    checkLimit(limit);
    if (query.action !== undefined && !Object.hasOwn(ACTIONS, query.action)) throw new Error('未知动作标识');
    if (query.queries !== undefined && (!Array.isArray(query.queries) || !query.queries.length || query.queries.length > 20 || query.queries.some(q => typeof q !== 'string' || !q.trim()))) throw Error('queries 需要 1—20 个非空搜索词组，各组取并集；query 内的空格词取交集');
    checkGroup(query.group);
    const hasTarget = !!(query.query?.trim() || query.queries?.length || query.ids?.length || query.group || query.kind || query.rig || query.action);
    const alternatives = query.queries ? new Set(query.queries.flatMap(q => searchAssets(q)).map(a => a.id)) : null;
    const list = (hasTarget ? searchAssets(query.query ?? '', query.group ?? '全部') : []).filter(asset => {
        const available = capabilities(asset);
        return (!allowedIds || allowedIds.includes(asset.id)) && (!alternatives || alternatives.has(asset.id)) && (!query.ids || query.ids.includes(asset.id)) && (!query.kind || asset.kind === query.kind)
            && (!query.rig || available.rig === query.rig) && (!query.action || available.actions.includes(query.action));
    });
    const assets = list.slice(offset, offset + limit).map(asset => {
        const available = capabilities(asset);
        const legacyDefaults = Object.hasOwn(parameterDefaults, asset.id) ? parameterDefaults[asset.id] : undefined;
        const parameterPatchField = asset.parameters ? 'assetParameters' : legacyDefaults ? 'parameters' : null;
        const basic = { id: asset.id, name: asset.name, kind: asset.kind, group: asset.group, defaults: asset.defaults,
            capabilities: available, parameterPatchField, parameterKeys: Object.keys(asset.parameters ?? legacyDefaults ?? {}) };
        return query.details ? { ...asset, ...basic, legacyParameterDefaults: legacyDefaults, joints: available.pose ? assetJoints(asset.id) : {},
            addExample: { operation: 'add', asset: asset.id, id: 'new-entity', ...(parameterPatchField ? { patch: { [parameterPatchField]: asset.parameters
                ? Object.fromEntries(Object.entries(asset.parameters).map(([key, field]) => [key, field.default])) : legacyDefaults } } : {}) } } : basic;
    });
    return structuredClone({
        found: list.length > 0,
        message: !hasTarget ? '请先指定要找的白模名称、关键词、ID 或类型；空查询不返回资产库。' : !list.length ? '没有找到符合条件的内置白模。' : `找到 ${list.length} 个匹配白模。`,
        total: list.length, offset, limit, nextOffset: offset + assets.length < list.length ? offset + assets.length : null,
        groups: [...new Set(list.map(asset => asset.group))].map(name => ({ name, count: list.filter(asset => asset.group === name).length })),
        missingQueries: [...new Set(query.queries ?? (query.query?.trim() ? [query.query] : []))].filter(term => { const matches = new Set(searchAssets(term).map(a => a.id)); return !list.some(asset => matches.has(asset.id)); }),
        missingIds: [...new Set(query.ids ?? [])].filter(id => !ASSETS.some(asset => asset.id === id && (!allowedIds || allowedIds.includes(id)))), assets,
        actions: Object.fromEntries([...new Set(assets.flatMap(asset => asset.capabilities.actions))].map(action => [action, ACTIONS[action]])),
        conventions: '单位米／秒，+Y 向上，人物 +Z 向前。rotation 用弧度，pose 用度，尺寸写入 parameterPatchField 指定的字段。'
    });
}

export function readAssetCatalog(query: AssetCatalogQuery, allowedIds?: readonly string[]) {
    return 'searches' in query ? searchCatalog(query, allowedIds) : queryAssetCatalog(query, allowedIds);
}
