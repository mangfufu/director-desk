import type { AppContext } from '../app-context.ts';
import type { Entity } from '../model.ts';
import { canBindHand, detachHandBinding, attachHandBinding } from '../animation/hand-binding.ts';
import { options } from './common.ts';
import './native-animation-editor.css';

export function createHandBindingEditor(ctx: AppContext, refresh: () => void) {
    const content = document.querySelector<HTMLElement>('#inspector-content')!;
    let parameter = 'offset.0';
    content.addEventListener('change', event => {
        const input = event.target as HTMLInputElement | HTMLSelectElement; if (!input.closest('.hand-binding-editor')) return;
        event.stopPropagation(); const e = ctx.current(); if (!e || e.kind !== 'prop') return;
        if (input.id === 'hand-target') {
            const previous = e.handBinding ? JSON.stringify([e.handBinding.actorId, e.handBinding.hand]) : '';
            if (input.value === previous) return;
            if (e.locked || ctx.busy || ctx.draft || ctx.history.pending) { input.value = previous; return; }
            const selected = input.value, focused = document.activeElement === input;
            const applied = ctx.change(() => {
                const root = ctx.engine.models.get(e.id)!;
                if (!selected) { detachHandBinding(e, root); return; }
                const [actorId, hand] = JSON.parse(selected) as [string, 'left' | 'right'];
                const actor = ctx.project.entities.find(a => a.id === actorId);
                if (!actor || !canBindHand(actor, hand)) throw Error('请先选择可用的人物手部');
                attachHandBinding(e, actor, hand, root, ctx.engine.handFrame({ actorId, hand }));
            }, false);
            if (applied && selected) ctx.engine.positionKeying = false;
            if (input.isConnected && !applied) input.value = previous;
            if (focused) content.querySelector<HTMLSelectElement>('#hand-target')?.focus({ preventScroll: true });
            return;
        }
        if (input.id === 'hand-parameter') { parameter = input.value; refresh(); return; }
        if (input.id !== 'hand-value' || e.locked || !e.handBinding) return;
        const [field, index] = parameter.split('.'), key = field as 'offset' | 'rotation', value = Number(input.value) * (key === 'rotation' ? Math.PI / 180 : 1);
        if (e.handBinding[key][Number(index)] === value) return;
        ctx.change(() => { e.handBinding![key][Number(index)] = value; }, false);
    });
    return { render(e: Entity) {
        const choices: [string, string][] = ctx.project.entities.flatMap(actor => (['left', 'right'] as const).filter(hand => canBindHand(actor, hand))
            .map(hand => [JSON.stringify([actor.id, hand]), `${actor.name} · ${hand === 'left' ? '左手' : '右手'}`] as [string, string]));
        const chosen = e.handBinding ? JSON.stringify([e.handBinding.actorId, e.handBinding.hand]) : '';
        const parameters: [string, string][] = ['offset', 'rotation'].flatMap(field => ['X', 'Y', 'Z'].map((axis, i) => [`${field}.${i}`, `${field === 'offset' ? '握持偏移' : '握持旋转'} ${axis} / ${field === 'offset' ? '米' : '度'}`] as [string, string]));
        const [field, index] = parameter.split('.'), value = e.handBinding?.[field as 'offset' | 'rotation'][Number(index)] ?? 0;
        return `<div class="native-editor hand-binding-editor" title="绑定后跟随手部，并替换原走位；解除时保留当前位置。"><label class="field"><span>手持绑定</span><select id="hand-target" aria-label="绑定人物与手部" ${e.locked || !choices.length ? 'disabled' : ''}>${options([['', choices.length ? '不绑定' : '先添加人物或映射手部骨骼'], ...choices], chosen)}</select></label><div class="native-values"><select id="hand-parameter" aria-label="握持调整参数">${options(parameters, parameter)}</select><input id="hand-value" aria-label="握持参数值" type="number" step="${field === 'offset' ? '.01' : '5'}" value="${Number((value * (field === 'rotation' ? 180 / Math.PI : 1)).toFixed(6))}" ${e.handBinding ? '' : 'disabled'}/></div></div>`;
    } };
}
