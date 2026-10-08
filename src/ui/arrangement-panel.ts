import type { AppContext } from '../app-context.ts';
import { selectedEntities } from '../editor/timeline-selection.ts';
import { arrangementBounds } from '../editor/arrangement-bounds.ts';
import { arrangeEntities, type Arrangement } from '../building/arrangement.ts';
import { $, button, escape, options } from './common.ts';
import type { Vec3 } from '../model.ts';

export function createArrangementPanel(ctx: AppContext) {
    let ids: string[] = [];
    function open() {
        ids = selectedEntities().filter(id => ctx.project.entities.some(e => e.id === id));
        if (!ids.length && ctx.current()) ids = [ctx.selected];
        if (!ids.length) { ctx.toast('请先选择对象'); return; }
        ctx.playing = false;
        const vector = (key: string, value: Vec3) => `<div class="triple">${['X', 'Y', 'Z'].map((axis, i) => `<label class="field"><span>${axis}</span><input id="arrange-${key}-${i}" type="number" step=".1" value="${value[i]}"></label>`).join('')}</div>`;
        ctx.showModal('排列', `<div class="arrangement-panel"><label class="field"><span>方式</span><select id="arrange-action">${options([...(ids.length >= 2 ? [['align', '对齐'], ['distribute', '等距分布']] as [string, string][] : []), ['line', '直线阵列'], ['grid', '网格阵列'], ['circle', '环形阵列']], ids.length >= 2 ? 'align' : 'line')}</select></label><section data-arrange-align><div class="double"><label class="field"><span>轴</span><select id="arrange-axis">${options([['x', 'X'], ['y', 'Y'], ['z', 'Z']], 'x')}</select></label><label class="field"><span>边界</span><select id="arrange-alignment">${options([['min', '最小边界'], ['center', '中心'], ['max', '最大边界']], 'center')}</select></label></div><label class="field"><span>基准对象</span><select id="arrange-anchor">${ids.map(id => `<option value="${escape(id)}">${escape(ctx.project.entities.find(e => e.id === id)!.name)}</option>`).join('')}</select></label></section><section data-arrange-array><label class="field"><span>数量（含原件）</span><input id="arrange-count" type="number" min="2" max="1000" value="5"></label><div data-arrange-linear><span>间距 · 米</span>${vector('step', [2, 0, 0])}</div><div data-arrange-grid><label class="field"><span>列数</span><input id="arrange-columns" type="number" min="1" value="3"></label><span>行偏移 · 米</span>${vector('row', [0, 0, 2])}</div><div data-arrange-circle><label class="field"><span>半径 · 米</span><input id="arrange-radius" type="number" min=".01" step=".1" value="3"></label><label><input id="arrange-rotate" type="checkbox">沿圆周旋转</label></div></section></div>`, button('arrange-apply', '应用', '', 'primary') + button('close-modal', '取消', '', 'subtle'));
        const update = () => {
            const action = $('#arrange-action').value, array = !['align', 'distribute'].includes(action);
            for (const [part, show] of [['align', !array], ['array', array], ['linear', array && action !== 'circle'], ['grid', action === 'grid'], ['circle', action === 'circle']] as const)
                document.querySelector<HTMLElement>(`[data-arrange-${part}]`)!.hidden = !show;
            $('#arrange-anchor').disabled = action !== 'align';
        };
        $('#arrange-action').addEventListener('change', update); update();
    }
    return { handle(action: string) {
        if (action === 'arrange-open') { open(); return true; }
        if (action !== 'arrange-apply') return false;
        const mode = $('#arrange-action').value;
        const vec = (key: string) => [0, 1, 2].map(i => Number($(`#arrange-${key}-${i}`).value)) as Vec3;
        if (ctx.change(() => {
            const layout: Arrangement = ['align', 'distribute'].includes(mode) ? { action: mode as 'align' | 'distribute', entityIds: ids, axis: $('#arrange-axis').value as 'x' | 'y' | 'z', alignment: $('#arrange-alignment').value as 'min' | 'center' | 'max', anchorId: $('#arrange-anchor').value, bounds: arrangementBounds(ctx.engine, ids) }
                : { action: 'array', entityIds: ids, shape: mode as 'line' | 'grid' | 'circle', count: Number($('#arrange-count').value), step: vec('step'), rowStep: vec('row'), columns: Number($('#arrange-columns').value), radius: Number($('#arrange-radius').value), rotate: $<HTMLInputElement>('#arrange-rotate').checked };
            ctx.project = arrangeEntities(ctx.project, layout);
        })) ctx.closeModal();
        return true;
    } };
}
