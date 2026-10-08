import type { AppContext } from '../app-context.ts';
import { selectedEntities, setSelectedEntities } from '../editor/timeline-selection.ts';
import { assertStagingAsset, createStagingAsset, insertStagingAsset } from '../building/staging-asset.ts';
import { listStagingAssets, getStagingAsset, saveStagingAsset, removeStagingAsset, renameStagingAsset } from '../building/staging-store.ts';
import { download } from '../storage.ts';
import { safeFilename } from '../production/notes.ts';
import { uid, type Vec3 } from '../model.ts';
import { $, button, escape } from './common.ts';
import './staging-library.css';

export function createStagingLibrary(ctx: AppContext) {
    let query = '', offset = 0, current = '', busy = false, generation = 0;
    const file = document.createElement('input'); file.type = 'file'; file.accept = '.staging,.json'; file.hidden = true; file.id = 'staging-file'; document.body.append(file);
    async function render(open = false) {
        const mounted = document.querySelector('.staging-library');
        const ticket = ++generation, result = await listStagingAssets(query, offset, 5);
        if (ticket !== generation || !open && !mounted?.isConnected) return;
        if (!result.items.length && offset > 0) { offset = 0; return render(open); }
        if (!result.items.some(r => r.id === current)) current = result.items[0]?.id ?? '';
        const item = result.items.find(r => r.id === current);
        ctx.showModal('布景库', `<div class="staging-library"><div class="staging-search"><input id="staging-query" placeholder="搜索布景" aria-label="搜索布景" value="${escape(query)}">${button('staging-search', '搜索', '', 'subtle')}${button('staging-import', '导入', '', 'subtle')}</div><div class="staging-list">${result.items.map(r => `<button class="staging-item ${r.id === current ? 'active' : ''}" data-act="staging-choose" data-id="${escape(r.id)}" title="${escape(r.name)}"><span>${escape(r.name)}</span><small>${r.count} 个对象</small></button>`).join('') || '<p class="empty-state">还没有布景</p>'}</div><div class="staging-pages">${button('staging-prev', '上一页', '', 'subtle', offset ? '' : 'disabled')}<span>${Math.floor(offset / 5) + 1} / ${Math.max(1, Math.ceil(result.total / 5))}</span>${button('staging-next', '下一页', '', 'subtle', result.nextOffset === null ? 'disabled' : '')}</div><label class="field"><span>名称</span><input id="staging-name" maxlength="200" value="${escape(item?.name ?? '')}"></label><div class="staging-actions">${button('staging-save', '保存当前选择', '', 'subtle')}${item ? button('staging-rename', '重命名', '', 'subtle') + button('staging-export', '导出', '', 'subtle') + button('staging-remove', '删除', '', 'subtle') : ''}</div>${item ? `<span>插入位置 · 米</span><div class="triple">${['X', 'Y', 'Z'].map((axis, i) => `<label class="field"><span>${axis}</span><input id="staging-pos-${i}" type="number" step=".1" value="${ctx.engine.orbit.target.getComponent(i).toFixed(2)}"></label>`).join('')}</div>` : ''}</div>`, (item ? button('staging-insert', '插入', '', 'primary') : '') + button('close-modal', '关闭', '', 'subtle'));
    }
    async function run(action: () => Promise<void>) {
        if (busy || ctx.busy || ctx.draft || ctx.history.pending) return;
        busy = true;
        try { await action(); } catch (error) { ctx.toast(error instanceof Error ? error.message : String(error), true); }
        finally { busy = false; }
    }
    file.addEventListener('change', () => {
        const input = file.files?.[0]; file.value = ''; if (!input) return;
        void run(async () => {
            const item: unknown = JSON.parse(await input.text()); assertStagingAsset(item); item.id = uid(); item.updated = Date.now();
            await saveStagingAsset(item); current = item.id; query = ''; offset = 0; await render();
        });
    });
    return { handle(action: string, el: HTMLElement) {
        if (!action.startsWith('staging-')) return false;
        void run(async () => {
            if (action === 'staging-open') { ctx.playing = false; offset = 0; await render(true); }
            else if (action === 'staging-choose') { current = el.dataset.id!; await render(); }
            else if (action === 'staging-search') { query = $('#staging-query').value; offset = 0; await render(); }
            else if (action === 'staging-prev' || action === 'staging-next') { offset = Math.max(0, offset + (action === 'staging-prev' ? -5 : 5)); await render(); }
            else if (action === 'staging-import') file.click();
            else if (action === 'staging-save') {
                const ids = selectedEntities(), item = createStagingAsset(ctx.project, ids.length ? ids : [ctx.selected], $('#staging-name').value.trim() || '新布景');
                await saveStagingAsset(item); current = item.id; query = ''; offset = 0; await render(); ctx.toast(`已保存 ${item.entityIds.length} 个对象`);
            } else if (action === 'staging-rename') { await renameStagingAsset(current, $('#staging-name').value.trim()); await render(); }
            else if (action === 'staging-remove') { await removeStagingAsset(current); current = ''; await render(); }
            else if (action === 'staging-export') {
                const item = await getStagingAsset(current); download(new Blob([JSON.stringify(item)], { type: 'application/json' }), safeFilename(item.name) + '.staging');
            } else if (action === 'staging-insert') {
                const position = [0, 1, 2].map(i => Number($(`#staging-pos-${i}`).value)) as Vec3;
                const before = ctx.project, revision = ctx.revision; ctx.playing = false; ctx.busy = true;
                try {
                    const item = await getStagingAsset(current), result = insertStagingAsset(before, item, position);
                    await ctx.engine.externalModels.prepare(result.project);
                    if (ctx.project !== before || ctx.revision !== revision) throw Error('工程已变化，请重新插入');
                    ctx.busy = false;
                    if (ctx.change(() => { ctx.project = result.project; ctx.selected = result.addedIds[0]; })) {
                        setSelectedEntities(result.addedIds); ctx.selectEntity(result.addedIds[0], true); ctx.closeModal();
                    }
                } finally { ctx.busy = false; ctx.engine.externalModels.retain([ctx.project, ...ctx.history.undoStack, ...ctx.history.redoStack]); }
            }
        });
        return true;
    } };
}
