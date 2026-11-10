import { numericDial } from './numeric-dial.ts';
import { numberAt } from '../animation/channels.ts';
import * as T from 'three';
import type { AppContext } from '../app-context.ts';
import type { Entity } from '../model.ts';
import { button, num, select } from './common.ts';
import type { InspectorNavigation } from './inspector-navigation.ts';
import { inspectorFocal } from '../editor/camera-focal.ts';

export function cameraInspector(ctx: AppContext, e: Entity, navigation: InspectorNavigation) {
    const c = e.camera!;
    const animated = typeof c.effects?.channels?.focal === 'object', dolly = !!c.effects?.dollyZoom;
    const focal = inspectorFocal(c, ctx.time, ctx.engine.cameras.get(e.id)?.getFocalLength());
    const focalLabel = animated && !dolly ? '当前焦距 / mm' : '焦距 / mm';
    const lens = `<div class="button-row">${button('preview-selected', '查看画面', 'eye', 'subtle')}${button('cut-selected', '设为此处镜头', '', 'primary')}</div><div class="camera-lens-dials">${numericDial(focalLabel, 'camera.focal', Number(focal.toFixed(2)), 8, 300, .01, dolly, true)}${numericDial('对焦距离 / m', 'camera.focusDistance', numberAt(c.effects?.channels?.focusDistance, ctx.time, 5), .05, 2000, .01, !!c.effects?.focusTargetId, true)}${numericDial('景深虚化强度', 'camera.blur', numberAt(c.effects?.channels?.blur, ctx.time, 0), 0, 1, .01)}</div>${animated || dolly ? button('cinema-focal-open', dolly ? '希区柯克变焦' : '变焦关键帧', '', 'wide subtle') : ''}<div class="action-grid" aria-label="景别辅助构图">${['全景', '中景', '近景', '特写'].map(s => `<button data-framing="${s}">${s}</button>`).join('')}</div>`;
    const target = select('机位方式', 'camera.mode', [['free', '独立机位 / 路径'], ['follow', '跟随对象'], ['pov', '绑定对象 / POV']], c.mode)
        + select('看向 / 绑定对象', 'camera.targetId', [['', '固定空间目标'], ...ctx.project.entities.filter(x => x.kind !== 'camera').map(x => [x.id, x.name] as [string, string])], c.targetId)
        + (c.mode === 'free' ? select('机位朝向', 'camera.aim', [['target', '看向目标 / 注视点'], ['manual', '手动旋转']], c.aim) : select('继承目标转向', 'camera.inheritRotation', [['true', '继承转向 / 头部动作'], ['false', '跟随位置 / 稳定头部']], String(c.inheritRotation)))
        + `<div class="field-pair">${num('目标高度 / m', 'camera.targetHeight', c.targetHeight, '.05')}${num('目标响应 / 秒', 'camera.aimResponse.duration', c.aimResponse?.duration ?? 0, '.05', `min="0" max="2" ${c.mode === 'pov' || c.mode === 'free' && c.aim !== 'target' ? 'disabled' : ''}`)}</div>`;
    const coordinate = c.mode === 'free' ? c.aim === 'target'
        ? `<div class="section-label">固定注视点<span>米</span></div><div class="triple">${['X', 'Y', 'Z'].map((a, i) => num(a, 'target.' + i, c.target[i])).join('')}</div>`
        : `<div class="section-label">机位旋转<span>度</span></div><div class="triple">${['X', 'Y', 'Z'].map((a, i) => num(a, 'rot.' + i, T.MathUtils.radToDeg(e.rotation[i]), '1')).join('')}</div>`
        : `<div class="section-label">机位偏移<span>米</span></div><div class="triple">${['X', 'Y', 'Z'].map((a, i) => num(a, 'offset.' + i, c.offset[i])).join('')}</div>`;
    return navigation.render(`${e.id}:camera`, [{ id: 'lens', label: '镜头', html: '<div class="camera-primary">' + lens + '</div>' }, { id: 'target', label: '机位与目标', html: '<div class="camera-primary">' + target + '</div>' }, { id: 'coordinates', label: '注视坐标', html: coordinate }]);
}

export function cameraMotionInspector(_e: Entity) {
    const motion = button('cinema-open', '运镜参数', '', 'wide subtle') + button('look-open', '视线关键帧', '', 'wide subtle') + `<div class="action-grid">${['推近', '拉远', '横移', '升高', '环绕'].map(s => `<button data-motion="${s}">${s}</button>`).join('')}</div>`;
    return motion;
}

export function cameraVisibilityInspector(e: Entity) {
    const c = e.camera!;
    const walls = [['north', '北墙'], ['south', '南墙'], ['east', '东墙'], ['west', '西墙'], ['ceiling', '天花板']].map(([w, l]) => `<label class="check"><input type="checkbox" data-wall="${w}" ${c.hideWalls.includes(w) ? 'checked' : ''}/>拍摄时移除${l}</label>`).join('');
    return walls + button('camera-hidden-open', '隐藏对象', '', 'wide subtle');
}
