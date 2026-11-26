import { VISUAL_ASSETS } from './visuals/catalog.ts';
import { HUMAN_ASSETS } from './assets/catalog/humans.ts';
import { SHAPE_ASSETS } from './assets/catalog/shapes.ts';
import { ANIMAL_ASSETS } from './assets/catalog/animals.ts';
import { CREATURE_ASSETS } from './assets/catalog/creatures.ts';
import { HUMAN_JOINTS } from './assets/joint-schema.ts';
import { FURNITURE_ASSETS } from './assets/catalog/furniture.ts';
import { HAND_PROP_ASSETS } from './assets/catalog/hand-props.ts';
import { ARCHITECTURE_ASSETS, CIRCULATION_ASSETS } from './assets/catalog/architecture.ts';
import { ROAD_ASSETS } from './assets/catalog/roads.ts';
import { PLANT_ASSETS, TERRAIN_ASSETS } from './assets/catalog/environment.ts';
import { BUILDING_ASSETS } from './assets/catalog/buildings.ts';
import { INDUSTRIAL_ASSETS, THEMED_ASSETS, VEHICLE_ASSETS } from './assets/catalog/production-props.ts';
import type { AssetDefinition } from './assets/catalog/types.ts';
import { ROOM_PART_ASSETS } from './assets/catalog/room-parts.ts';
import { LIGHT_ASSETS } from './assets/catalog/lights.ts';
const legacyAssets = [
    { id: 'ground', name: '地面 · 可调尺寸', kind: 'prop', group: '搭建', icon: '▱' },
    { id: 'road', name: '道路 · 可调尺寸', kind: 'prop', group: '室外', icon: 'Ⅱ' },
    { id: 'building', name: '楼体白模', kind: 'prop', group: '室外', icon: '▥' },
    { id: 'bench', name: '长椅', kind: 'prop', group: '室外', icon: '⊓' },
    { id: 'fence', name: '围栏', kind: 'prop', group: '室外', icon: '▥' },
    { id: 'streetlight', name: '路灯', kind: 'prop', group: '室外', icon: 'Γ' },
    { id: 'person', name: '人物 · 男', kind: 'actor', group: '人物', icon: '♙' },
    { id: 'woman', name: '人物 · 女', kind: 'actor', group: '人物', icon: '♙' },
    { id: 'crowd', name: '群演队列', kind: 'crowd', group: '人物', icon: '♙♙' },
    { id: 'bed', name: '双人床', kind: 'prop', group: '家具', icon: '▰' },
    { id: 'nightstand', name: '床头柜', kind: 'prop', group: '家具', icon: '▣' },
    { id: 'wardrobe', name: '衣柜', kind: 'prop', group: '家具', icon: '▥' },
    { id: 'desk', name: '书桌', kind: 'prop', group: '家具', icon: '⊓' },
    { id: 'chair', name: '椅子', kind: 'prop', group: '家具', icon: '♧' },
    { id: 'sofa', name: '沙发', kind: 'prop', group: '家具', icon: '▰' },
    { id: 'table', name: '餐桌', kind: 'prop', group: '家具', icon: '⊓' },
    { id: 'lamp', name: '台灯', kind: 'prop', group: '道具', icon: '⌂' },
    { id: 'laptop', name: '电脑', kind: 'prop', group: '道具', icon: '▱' },
    { id: 'cup', name: '杯子', kind: 'prop', group: '道具', icon: '∪' },
    { id: 'sword', name: '长剑', kind: 'prop', group: '道具', icon: '†' },
    { id: 'car', name: '汽车简模', kind: 'prop', group: '道具', icon: '▰' },
    { id: 'tree', name: '树', kind: 'prop', group: '自然', icon: '♠' },
    { id: 'rock', name: '石头', kind: 'prop', group: '自然', icon: '⬡' },
    { id: 'cube', name: '立方体 · 1 m', kind: 'prop', group: '搭建', icon: '◇' },
    { id: 'sphere', name: '球体 · 1 m', kind: 'prop', group: '搭建', icon: '○' },
    { id: 'cylinder', name: '圆柱 · 1 m', kind: 'prop', group: '搭建', icon: '▯' },
    { id: 'wall', name: '墙体', kind: 'prop', group: '搭建', icon: '▥' },
    { id: 'stairs', name: '楼梯', kind: 'prop', group: '搭建', icon: '▟' },
    { id: 'door', name: '门 · 旋转开合', kind: 'prop', group: '搭建', icon: '▯' },
] as const;

export const ASSETS: readonly AssetDefinition[] = [...legacyAssets, ...HUMAN_ASSETS, ...ANIMAL_ASSETS, ...CREATURE_ASSETS, ...SHAPE_ASSETS, ...FURNITURE_ASSETS, ...HAND_PROP_ASSETS, ...ARCHITECTURE_ASSETS, ...CIRCULATION_ASSETS, ...ROAD_ASSETS, ...PLANT_ASSETS, ...TERRAIN_ASSETS, ...BUILDING_ASSETS, ...INDUSTRIAL_ASSETS, ...THEMED_ASSETS, ...VEHICLE_ASSETS, ...ROOM_PART_ASSETS, ...LIGHT_ASSETS, ...VISUAL_ASSETS];
const assetsById = new Map(ASSETS.map(asset => [asset.id, asset]));
const assetsByGroup = new Map<string, AssetDefinition[]>();
const searchTerms = new Map(ASSETS.map(asset => {
    const [id, name, group, ...aliases] = [asset.id, asset.name, asset.group, ...(asset.aliases ?? [])].map(term => term.toLocaleLowerCase());
    const members = assetsByGroup.get(asset.group);
    if (members) members.push(asset);
    else assetsByGroup.set(asset.group, [asset]);
    return [asset.id, { id, name, aliases, text: [id, name, group, ...aliases].join(' ') }];
}));
export const ASSET_GROUPS = [...assetsByGroup.keys()];
export const findAsset = (id: string) => assetsById.get(id);
export const isAnimalAsset = (id: string) => ['quadruped', 'bird', 'fish', 'serpent'].includes(findAsset(id)?.capabilities?.rig ?? '');
export const assetJoints = (id: string) => findAsset(id)?.joints ?? HUMAN_JOINTS;
export function searchAssets(query: string, group = '全部', ranked = false) {
    const term = query.toLocaleLowerCase().trim();
    const words = term.split(/\s+/).filter(Boolean);
    const candidates = group === '全部' ? ASSETS : assetsByGroup.get(group) ?? [];
    const matches = candidates.filter(asset => words.every(word => searchTerms.get(asset.id)!.text.includes(word)));
    if (!ranked || !term) return matches;
    const rank = (asset: AssetDefinition) => {
        const { id, name, aliases } = searchTerms.get(asset.id)!;
        if (id === term) return 0;
        if (name === term) return 1;
        if (aliases.includes(term)) return 2;
        return name.startsWith(term) || aliases.some(alias => alias.startsWith(term)) ? 3 : 4;
    };
    return matches.map(asset => ({ asset, rank: rank(asset) })).sort((a, b) => a.rank - b.rank).map(entry => entry.asset);
}
