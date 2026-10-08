import type { AppContext } from '../app-context.ts';
import { selectedEntities, setSelectedEntities } from '../editor/timeline-selection.ts';
import { editGroup, groupPivot, transformEntities, duplicateEntities } from '../building/group-editing.ts';
import { groupForEntity } from '../building/entity-groups.ts';
import { uid, type Vec3 } from '../model.ts';
import { $, button, escape } from './common.ts';
import './group-panel.css';

export function groupSelection(ctx: AppContext) {
    const selected = new Set(selectedEntities()), ids = ctx.project.entities.filter(e => selected.has(e.id)).map(e => e.id);
    const group = ctx.project.groups?.find(g => g.entityIds.length === ids.length && g.entityIds.every(id => selected.has(id)));
    return { ids, group };
}
export function renderGroupInspector(ctx: AppContext): boolean {
    const { ids, group } = groupSelection(ctx);
    if (ids.length < 2 && !(ctx.inspectorTab === 'group' && group)) return false;
    const members = ctx.project.entities.filter(e => ids.includes(e.id));
    $('#inspector-header').innerHTML = `<div class="inspect-title"><h2>${group ? escape(group.name) : '多选对象'}</h2><span class="type-badge">${ids.length} 个</span></div>`;
    $('#inspector-tabs').innerHTML = '';
    const axes = (key: string, step: string) => `<div class="triple">${['X', 'Y', 'Z'].map((axis, i) => `<label class="field"><span>${axis}</span><input id="group-${key}-${i}" aria-label="${key === 'move' ? '平移' : '旋转'} ${axis}" type="number" step="${step}" value="0"></label>`).join('')}</div>`;
    $('#inspector-content').innerHTML = `<div class="group-panel"><section><label class="field"><span>组名</span><input id="group-name" maxlength="200" value="${escape(group?.name ?? '新编组')}"></label><div class="group-actions">${group ? button('group-rename', '重命名', '', 'subtle') + button('group-ungroup', '解组', '', 'subtle') : button('group-create', '编组', '', 'subtle')}</div></section><section><h3>整体平移 · 米</h3>${axes('move', '.1')}<h3>整体旋转 · 度</h3>${axes('rotate', '5')}<div class="group-actions">${button('group-transform', '应用', '', 'primary')}${button('group-copy', '复制', '', 'subtle')}</div></section><section><h3>成员</h3><select id="group-member" aria-label="单独编辑成员">${members.map(e => `<option value="${escape(e.id)}">${escape(e.name)}</option>`).join('')}</select>${button('group-edit-member', '单独编辑', '', 'subtle')}</section></div>`;
    $('#inspector-footer').innerHTML = '';
    return true;
}
export function createGroupCommands(ctx: AppContext) {
    function select(ids: string[]) {
        setSelectedEntities(ids); ctx.selectEntity(ids[0], true); ctx.inspectorTab = 'group'; ctx.renderPanels();
    }
    return { handle(action: string, el: HTMLElement) {
        if (!['group-create', 'group-rename', 'group-ungroup', 'group-transform', 'group-copy', 'group-edit-member', 'group-select'].includes(action)) return false;
        const { ids, group } = groupSelection(ctx);
        try {
            if (action === 'group-select') {
                const chosen = ctx.project.groups?.find(g => g.id === el.dataset.groupId) ?? groupForEntity(ctx.project, ctx.selected);
                if (!chosen) throw Error('当前对象尚未编组'); select(chosen.entityIds); return true;
            }
            if (action === 'group-edit-member') { ctx.selectEntity($('#group-member').value); return true; }
            const name = document.querySelector<HTMLInputElement>('#group-name')?.value.trim() || '新编组';
            if (action === 'group-create') {
                if (ids.length < 2) throw Error('请按 Ctrl 多选至少两个对象');
                if (ctx.change(() => editGroup(ctx.project, uid(), name, { action: 'create', entityIds: ids }))) select(ids);
            } else if (action === 'group-rename' || action === 'group-ungroup') {
                const chosen = group ?? groupForEntity(ctx.project, ctx.selected); if (!chosen) throw Error('请选择一个编组');
                ctx.change(() => editGroup(ctx.project, chosen.id, name, { action: action === 'group-rename' ? 'rename' : 'remove' }));
            } else if (action === 'group-transform') {
                const vector = (key: string) => [0, 1, 2].map(i => Number($(`#group-${key}-${i}`).value)) as Vec3;
                ctx.change(() => transformEntities(ctx.project, ids, { translation: vector('move'), rotation: vector('rotate').map(v => v * Math.PI / 180) as Vec3, pivot: groupPivot(ctx.project, ids, ctx.time) }), false);
            } else if (action === 'group-copy') {
                let copies: string[] = [];
                if (ctx.change(() => {
                    if (group) { const id = uid(); editGroup(ctx.project, group.id, undefined, { action: 'duplicate', newId: id }); copies = ctx.project.groups!.find(g => g.id === id)!.entityIds; }
                    else copies = duplicateEntities(ctx.project, ids).entityIds;
                })) select(copies);
            }
        } catch (error) { ctx.toast(error instanceof Error ? error.message : String(error), true); }
        return true;
    } };
}
