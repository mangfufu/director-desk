import type { AppContext } from '../app-context.ts';
import type { Entity } from '../model.ts';
import { HUMAN_ASSETS } from '../assets/catalog/humans.ts';
import { applyOperations } from '../automation/edits.ts';
import { options } from './common.ts';

export function createActorAppearance(ctx: AppContext) {
    const content = document.querySelector<HTMLElement>('#inspector-content')!;
    content.addEventListener('change', event => {
        const select = event.target as HTMLSelectElement;
        if (select.id !== 'actor-model-choice') return;
        event.stopPropagation();
        const e = ctx.current(), selected = select.value;
        if (!e || !selected || selected === e.asset) return;
        if (e.locked || ctx.busy || ctx.draft || ctx.history.pending) {
            select.value = e.asset;
            ctx.toast(e.locked ? '对象已锁定' : '请先完成或取消当前操作');
            return;
        }
        const focused = document.activeElement === select;
        try {
            const after = applyOperations(ctx.project, [{ operation: 'replace-actor', id: e.id, asset: selected }]);
            ctx.change(() => { ctx.project = after; });
        } catch (error) { ctx.toast((error as Error).message, true); }
        finally {
            if (select.isConnected) select.value = ctx.current()?.asset ?? e.asset;
            if (focused) content.querySelector<HTMLSelectElement>('#actor-model-choice')?.focus({ preventScroll: true });
        }
    });
    return { render(e: Entity) {
        const list: [string, string][] = HUMAN_ASSETS.map(a => [a.id, a.name]);
        if (!list.some(([id]) => id === e.asset)) list.unshift([e.asset, '当前模型']);
        return `<label class="field"><span>人物外形</span><select id="actor-model-choice" aria-label="人物外形" ${e.locked ? 'disabled' : ''}>${options(list,e.asset)}</select></label>`;
    } };
}
