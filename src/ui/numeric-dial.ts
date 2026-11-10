import { escape, num } from './common.ts';
import './numeric-dial.css';

/** Native range supplies keyboard semantics; the paired number retains field editing. */
export function numericDial(label: string, key: string, value: number, min: number, max: number, step: number, disabled = false, logarithmic = false) {
    const fraction = logarithmic ? Math.log(value / min) / Math.log(max / min) : (value - min) / (max - min);
    return `<div class="numeric-dial" data-log="${logarithmic}" style="--dial-angle:${-135 + Math.max(0, Math.min(1, fraction)) * 270}deg">
        <div class="numeric-dial-face"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M10 38 A20 20 0 1 1 38 38"/><circle cx="24" cy="24" r="14"/><path class="numeric-dial-needle" d="M24 15V10"/></svg><input type="range" aria-label="${escape(label)}" min="${min}" max="${max}" step="${step}" value="${value}" ${disabled ? 'disabled' : ''}/></div>
        ${num(label, key, value, String(step), `min="${min}" max="${max}" ${disabled ? 'disabled' : ''}`)}</div>`;
}

export function bindNumericDials() {
    const numberFor = (range: HTMLInputElement) => range.closest('.numeric-dial')!.querySelector<HTMLInputElement>('input[type=number]')!;
    const draw = (input: HTMLInputElement) => {
        const root = input.closest<HTMLElement>('.numeric-dial'); if (!root) return;
        const range = root.querySelector<HTMLInputElement>('input[type=range]')!;
        const value = Number(input.value), min = Number(range.min), max = Number(range.max);
        if (!input.value || !Number.isFinite(value)) return;
        const fraction = root.dataset.log === 'true' ? Math.log(Math.max(min, value) / min) / Math.log(max / min) : (value - min) / (max - min);
        root.style.setProperty('--dial-angle', `${-135 + Math.max(0, Math.min(1, fraction)) * 270}deg`);
        range.value = String(value);
    };
    document.addEventListener('input', event => {
        const input = event.target;
        if (!(input instanceof HTMLInputElement) || !input.closest('.numeric-dial')) return;
        if (input.type === 'range') {
            const number = numberFor(input); number.value = input.value;
            number.dispatchEvent(new Event('input', { bubbles: true }));
        }
        draw(input);
    });
    document.addEventListener('change', event => {
        const input = event.target;
        if (input instanceof HTMLInputElement && input.type === 'range' && input.closest('.numeric-dial')) {
            event.stopImmediatePropagation();
            const number = numberFor(input), focused = document.activeElement === input, field = number.dataset.field!;
            number.dispatchEvent(new Event('change', { bubbles: true }));
            // Inspector refresh replaces the controls; preserve keyboard adjustment focus.
            if (focused) document.querySelector<HTMLInputElement>(`.numeric-dial:has([data-field="${CSS.escape(field)}"]) input[type=range]`)?.focus({ preventScroll:true });
        }
    }, true);
    document.addEventListener('pointerdown', event => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement) || target.type !== 'range' || !target.closest('.numeric-dial') || target.disabled || event.button !== 0) return;
        let range = target;
        const field = numberFor(range).dataset.field!;
        event.preventDefault(); range.focus();
        // Leaving a typed number can commit and rebuild the inspector synchronously.
        if (!range.isConnected) {
            const replacement = document.querySelector<HTMLInputElement>(`.numeric-dial:has([data-field="${CSS.escape(field)}"]) input[type=range]`);
            if (!replacement || replacement.disabled) return;
            range = replacement; range.focus();
        }
        range.setPointerCapture(event.pointerId);
        let previousX = event.clientX, previousY = event.clientY;
        const start = Number(range.value);
        const min = Number(range.min), max = Number(range.max), step = Number(range.step);
        const log = range.closest<HTMLElement>('.numeric-dial')!.dataset.log === 'true';
        let fraction = log ? Math.log(start / min) / Math.log(max / min) : (start - min) / (max - min);
        const move = (e: PointerEvent) => {
            if (e.pointerId !== event.pointerId) return;
            const delta = (e.clientX - previousX + previousY - e.clientY) / 180 * (e.shiftKey ? .1 : 1);
            previousX = e.clientX; previousY = e.clientY;
            fraction = Math.max(0, Math.min(1, fraction + delta));
            const next = log ? min * Math.pow(max / min, fraction) : min + fraction * (max - min);
            range.value = String(Math.max(min, Math.min(max, Math.round(next / step) * step)));
            range.dispatchEvent(new Event('input', { bubbles: true }));
        };
        const finish = (cancel = false) => {
            range.removeEventListener('pointermove', move); range.removeEventListener('pointerup', up);
            range.removeEventListener('pointercancel', cancelDrag); range.removeEventListener('lostpointercapture', cancelDrag);
            window.removeEventListener('blur', cancelDrag); document.removeEventListener('keydown', key, true);
            if (range.hasPointerCapture(event.pointerId)) range.releasePointerCapture(event.pointerId);
            if (cancel) numberFor(range).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            else range.dispatchEvent(new Event('change', { bubbles: true }));
        };
        const up = (e: PointerEvent) => { if (e.pointerId === event.pointerId) finish(); };
        const cancelDrag = () => finish(true);
        const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); finish(true); } };
        range.addEventListener('pointermove', move); range.addEventListener('pointerup', up);
        range.addEventListener('pointercancel', cancelDrag); range.addEventListener('lostpointercapture', cancelDrag);
        window.addEventListener('blur', cancelDrag); document.addEventListener('keydown', key, true);
    });
}
