import type { Entity } from '../model.ts';

export function normalizedColor(value: string) {
    let hex = value.trim().replace(/^#/, '');
    if (/^[\da-f]{3}$/i.test(hex)) hex = [...hex].map(c => c + c).join('');
    if (!/^[\da-f]{6}$/i.test(hex)) throw Error('请输入有效的颜色，例如 #78A6D4');
    return '#' + hex.toLowerCase();
}

/** A chosen colour becomes visible immediately, including on imported instances. */
export function setEntityColor(entity: Entity, value: string, appearance?: 'original' | 'white' | 'color') {
    if (entity.locked) throw Error('对象已锁定');
    const color = normalizedColor(value);
    entity.color = color;
    if (entity.external) entity.external.appearance = appearance ?? 'color';
}

export const ENTITY_COLOR_SWATCHES: readonly (readonly [string, string])[] = [
    ['雪白', '#ffffff'], ['浅灰', '#d5d5d0'], ['灰色', '#929292'], ['深灰', '#505050'], ['墨黑', '#202020'], ['暖白', '#eee5d5'],
    ['浅红', '#f3adad'], ['红色', '#d95656'], ['暗红', '#853b43'], ['浅橙', '#f6ceab'], ['橙色', '#e99c51'], ['棕色', '#8e6249'],
    ['浅黄', '#f4e8a2'], ['黄色', '#e6c755'], ['橄榄', '#99964c'], ['浅绿', '#b8dba6'], ['绿色', '#78ae78'], ['深绿', '#3e705b'],
    ['浅青', '#a5ded7'], ['青色', '#57aaa3'], ['深青', '#386e7e'], ['浅蓝', '#b2cee9'], ['蓝色', '#78a6d4'], ['深蓝', '#465c91'],
    ['浅紫', '#d4c1e7'], ['紫色', '#9b7fbd'], ['深紫', '#695180'], ['浅粉', '#ecc6d8'], ['粉色', '#ca89ae'], ['玫红', '#995573'],
];
