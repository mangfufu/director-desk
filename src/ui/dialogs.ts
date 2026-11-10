import { shortcutReference } from './shortcut-reference.ts';
import { createModalPages } from './modal-pages.ts';
import { SCENE_TEMPLATES } from '../scenes.ts';
import type { Entity } from '../model.ts';
import { $, button, escape, options } from './common.ts';
import type { AppContext } from '../app-context.ts';
import { seatTargets } from '../editor/seat-targets.ts';
export function createDialogs(ctx: AppContext) {
    const pages = createModalPages(ctx);
    function showModal(title: string, body: string, footer = '', child = false) { const template = document.createElement('template'); template.innerHTML = `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="${title}"><header class="modal-header"><div><h2>${title}</h2></div>${button('close-modal', '', 'close', 'icon-button', 'aria-label="关闭"')}</header><div class="modal-body">${body}</div>${footer ? `<footer class="modal-footer">${footer}</footer>` : ''}</section></div>`; if(!pages.show(title, template.content.firstElementChild as HTMLElement, child))return false; const input = $('#modal-root input') as HTMLInputElement | null; input?.focus();return true; }
    function closeModal() { pages.close(); }
    function projectDialog() { if (!showModal('项目', `<label class="field"><span>项目名称</span><input id="rename-input" value="${escape(ctx.project.name)}" maxlength="80"/></label>`, button('rename-project', '保存名称', '', 'primary'))) return; }
    function deleteDialog(e: Entity) {
        if (e.kind === 'camera') {
            const others = ctx.project.entities.filter(x => x.kind === 'camera' && x.id !== e.id);
            if (!others.length) {
                ctx.toast('至少保留一台摄影机', true);
                return;
            }
            if (!showModal('删除摄影机', `<p class="modal-copy">删除「${escape(e.name)}」，并将使用它的切镜替换为：</p><select id="replacement-camera">${options(others.map(x => [x.id, x.name]), others[0].id)}</select>`, button('close-modal', '取消', '', 'subtle') + button('confirm-delete', '替换并删除', '', 'danger', `data-id="${e.id}"`))) return;
        }
        else
            ctx.deleteEntity(e.id);
    }
    function seatDialog() {
        const furniture = seatTargets(ctx.project,ctx.engine.models,ctx.time);
        if (!furniture.length) {
            ctx.toast('先添加座椅，或在道具的“接触”面板设置座面');
            return;
        }
        if (!showModal('放到座位', `<label class="field"><span>定位目标</span><select id="seat-target">${options(furniture.map(e => [e.id, e.name]), furniture[0].id)}</select></label>`, button('close-modal', '取消', '', 'subtle') + button('seat-apply', '定位并坐下', '', 'primary'))) return;
    }
    function helpDialog() { if (!showModal('操作与快捷键', shortcutReference(), button('close-modal','完成','','primary'), true)) return; $('.modal').classList.add('shortcuts-modal'); }
    function sceneDialog() {
        ctx.playing = false;
        if (!showModal('新建工程', '<div class="scene-template-grid">' + SCENE_TEMPLATES.map((t, i) => `<label class="scene-template"><input type="radio" name="scene-template" value="${t.id}" ${i === 0 ? 'checked' : ''}/><span class="template-kind">${t.type}</span><strong>${t.name}</strong><small>${t.detail}</small></label>`).join('') + '</div>', (ctx.dirty ? button('save-and-new', '保存当前项目后新建', '', 'subtle') : '') + button('confirm-new', '新建工程', '', 'primary'))) return;
        $('.modal').classList.add('template-modal');
    }
    return { sceneDialog, showModal, closeModal, projectDialog, deleteDialog, seatDialog, helpDialog };
}
