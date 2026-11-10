import type { AppContext } from '../app-context.ts';
import { ASSETS, ASSET_GROUPS } from '../asset-catalog.ts';
import { applyOperations } from '../automation/edits.ts';
import { $, button, escape, options } from './common.ts';

export function createReplacePropPanel(ctx: AppContext) {
    let targetId = '', group = 'resources', selected = '', animation = 'preserve';
    const drafts = new Map<string, { units: string; appearance: string; orientation: string[] }>();
    function remember() {
        animation = $('#replace-animation').value;
        if (document.querySelector('#replace-units')) drafts.set(selected, { units: $('#replace-units').value, appearance: $('#replace-appearance').value, orientation: [0, 1, 2].map(i => $(`#replace-axis-${i}`).value) });
    }
    function render() {
        const e = ctx.project.entities.find(e => e.id === targetId); if (!e || e.kind !== 'prop') return;
        const list: [string, string][] = group === 'resources' ? (ctx.project.resources ?? []).map(r => [r.id, r.name]) : ASSETS.filter(a => a.kind === 'prop' && a.group === group).map(a => [a.id, a.name]);
        if (!list.some(([id]) => id === selected)) selected = list[0]?.[0] ?? '';
        const same = e.external?.resourceId === selected, old = same ? e.external : null;
        const draft = drafts.get(selected);
        if (!ctx.showModal('替换选中道具', `<div class="resource-row"><select id="replace-group" aria-label="替换资产分类">${options([['resources', '工程导入资源'], ...ASSET_GROUPS.filter(g => ASSETS.some(a => a.kind === 'prop' && a.group === g)).map(g => [g, g] as [string, string])], group)}</select><select id="replace-asset" aria-label="替换资产">${options(list.length ? list : [['', '此分类暂无资源']], selected)}</select></div>${group === 'resources' ? `<div class="field-pair"><label class="field"><span>单位换算到米</span><input id="replace-units" type="number" min=".000001" step=".01" value="${escape(draft?.units ?? String(old?.unitScale ?? 1))}"/></label><label class="field"><span>显示方式</span><select id="replace-appearance">${options([['original', '原材质'], ['white', '白模'], ['color', '识别色']], draft?.appearance ?? old?.appearance ?? 'original')}</select></label></div><div class="triple">${['X', 'Y', 'Z'].map((axis, i) => `<label class="field"><span>${axis} 轴校正 / 度</span><input id="replace-axis-${i}" type="number" step="90" value="${escape(draft?.orientation[i] ?? String((old?.orientation[i] ?? 0) * 180 / Math.PI))}"/></label>`).join('')}</div>` : ''}<label class="field"><span>原生动画片段</span><select id="replace-animation">${options([['preserve', '保留'], ['clear', '清除']], animation)}</select></label>`, button('close-modal', '取消', '', 'subtle') + button('replace-prop-apply', '替换', '', 'primary', selected && !e.locked ? '' : 'disabled'))) return;
        $('#replace-group').addEventListener('change', () => { remember(); group = $('#replace-group').value; selected = ''; render(); });
        $('#replace-asset').addEventListener('change', () => { remember(); selected = $('#replace-asset').value; render(); });
    }
    return { handle(action: string) {
        if (action === 'replace-prop-open') { targetId = ctx.current()?.id ?? ''; const e = ctx.current(); group = e?.external ? 'resources' : ASSETS.find(a => a.id === e?.asset)?.group ?? '家具'; selected = e?.external?.resourceId ?? e?.asset ?? ''; animation = 'preserve'; drafts.clear(); render(); }
        else if (action === 'replace-prop-apply') {
            try {
                const patch = { animation: $('#replace-animation').value, ...(group === 'resources' ? { unitScale: Number($('#replace-units').value), appearance: $('#replace-appearance').value,
                    orientation: [0, 1, 2].map(i => Number($(`#replace-axis-${i}`).value) * Math.PI / 180) } : {}) };
                const next = applyOperations(ctx.project, [{ operation: 'replace-prop', id: targetId, asset: selected, patch }]);
                if (ctx.change(() => { ctx.project = next; })) { ctx.closeModal(); ctx.toast('已替换道具'); }
            } catch (error) { ctx.toast((error as Error).message, true); }
        } else return false;
        return true;
    } };
}
