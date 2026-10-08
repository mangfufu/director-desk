import { shortcutReference } from './shortcut-reference.ts';
import { createModalPages } from './modal-pages.ts';
import { SCENE_TEMPLATES } from '../scenes.ts';
import type { Entity } from '../model.ts';
import { $, button, escape, options } from './common.ts';
import type { AppContext } from '../app-context.ts';
import { worldContactAnchors } from '../assets/contact-anchors.ts';
export function createDialogs(ctx: AppContext) {
    const pages = createModalPages(ctx);
    function showModal(title: string, body: string, footer = '', child = false) { const template = document.createElement('template'); template.innerHTML = `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="${title}"><header class="modal-header"><div><h2>${title}</h2><p>${escape(ctx.project.name)}</p></div>${button('close-modal', '', 'close', 'icon-button', 'aria-label="关闭"')}</header><div class="modal-body">${body}</div>${footer ? `<footer class="modal-footer">${footer}</footer>` : ''}</section></div>`; pages.show(title, template.content.firstElementChild as HTMLElement, child); const input = $('#modal-root input') as HTMLInputElement | null; input?.focus(); }
    function closeModal() { pages.close(); }
    function projectDialog() { showModal('项目', `<label class="field"><span>项目名称</span><input id="rename-input" value="${escape(ctx.project.name)}" maxlength="80"/></label><div class="button-row">${button('scene-reuse-open', '场景复用 / 插入', '', 'subtle')}</div>`, button('resource-open', '工程模型资源', '', 'subtle') + button('resource-statistics', '资源统计', '', 'subtle') + button('rename-project', '保存名称', '', 'primary')); }
    function roomDialog() { showModal('房间尺寸与结构', `<label class="check"><input id="room-enabled" type="checkbox" ${ctx.project.room.enabled ? 'checked' : ''}/>显示房间结构</label><div class="triple">${['width', 'depth', 'height'].map((k, i) => `<label class="field"><span>${['宽度', '进深', '净高'][i]} / 米</span><input id="room-${k}" type="number" min="2.3" step=".1" value="${ctx.project.room[k as 'width']}"/></label>`).join('')}</div><div class="info-box">房间和家具使用真实尺寸。修改房间只改变墙体与地板，家具和人物保持原位置。</div>`, button('close-modal', '取消', '', 'subtle') + button('apply-room', '应用尺寸', '', 'primary')); }
    function deleteDialog(e: Entity) {
        if (e.kind === 'camera') {
            const others = ctx.project.entities.filter(x => x.kind === 'camera' && x.id !== e.id);
            if (!others.length) {
                ctx.toast('至少保留一台摄影机', true);
                return;
            }
            showModal('删除摄影机', `<p class="modal-copy">删除「${escape(e.name)}」，并将使用它的切镜替换为：</p><select id="replacement-camera">${options(others.map(x => [x.id, x.name]), others[0].id)}</select>`, button('close-modal', '取消', '', 'subtle') + button('confirm-delete', '替换并删除', '', 'danger', `data-id="${e.id}"`));
        }
        else
            ctx.deleteEntity(e.id);
    }
    function seatDialog() {
        const furniture = ctx.project.entities.filter(e => e.kind === 'prop' && e.visible).flatMap(e => worldContactAnchors(e, ctx.engine.models.get(e.id)!).filter(a => ['seat', 'bed'].includes(a.role) && a.normal[1] > .98).map((a, i) => ({ id: JSON.stringify([e.id, a.id]), name: `${e.name} · ${a.role === 'bed' ? '床面' : '座位'} ${i + 1} · ${a.position[1].toFixed(2)} 米` })));
        if (!furniture.length) {
            ctx.toast('先添加座椅，或在道具的“接触”面板设置座面');
            return;
        }
        showModal('放到座位', `<label class="field"><span>定位目标</span><select id="seat-target">${options(furniture.map(e => [e.id, e.name]), furniture[0].id)}</select></label>`, button('close-modal', '取消', '', 'subtle') + button('seat-apply', '定位并坐下', '', 'primary'));
    }
    function helpDialog() { showModal('操作与快捷键', shortcutReference(), button('close-modal','完成','','primary'), true); $('.modal').classList.add('shortcuts-modal'); }
    function sceneDialog() {
        ctx.playing = false;
        showModal('新建工程', '<div class="scene-template-grid">' + SCENE_TEMPLATES.map((t, i) => `<label class="scene-template"><input type="radio" name="scene-template" value="${t.id}" ${i === 0 ? 'checked' : ''}/><span class="template-kind">${t.type}</span><strong>${t.name}</strong><small>${t.detail}</small></label>`).join('') + '</div>', (ctx.dirty ? button('save-and-new', '保存当前项目后新建', '', 'subtle') : '') + button('confirm-new', '新建工程', '', 'primary'));
        $('.modal').classList.add('template-modal');
    }
    return { sceneDialog, showModal, closeModal, projectDialog, roomDialog, deleteDialog, seatDialog, helpDialog };
}
