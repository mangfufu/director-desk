import { t } from '../i18n/locale.ts';
import './context-menu.css';

export type ContextItem = { id: string; label: string; disabled?: boolean; run: () => void } | null;

/** One transient menu, shared by the editor surfaces. */
export function createContextMenu() {
    let root: HTMLDivElement | undefined;
    let events: AbortController | undefined;
    let returnFocus: HTMLElement | undefined;
    const close = (restoreFocus = false) => {
        events?.abort(); events = undefined;
        root?.remove(); root = undefined;
        if (restoreFocus && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    };
    const open = (x: number, y: number, items: ContextItem[], origin: HTMLElement) => {
        close(); returnFocus = origin;
        const menu = document.createElement('div'); root = menu;
        menu.className = 'editor-context-menu'; menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-label', t('快捷菜单')); menu.tabIndex = -1;
        menu.popover = 'manual';
        const entries = items.filter((item, index) => item || (index > 0 && items[index - 1] && items.slice(index + 1).some(Boolean)));
        for (const item of entries) {
            if (!item) { const line = document.createElement('div'); line.setAttribute('role', 'separator'); menu.append(line); continue; }
            const button = document.createElement('button');
            button.type = 'button'; button.setAttribute('role', 'menuitem'); button.tabIndex = -1;
            button.dataset.contextCommand = item.id; button.textContent = t(item.label); button.disabled = !!item.disabled;
            button.onclick = event => { event.stopPropagation(); close(true); item.run(); };
            menu.append(button);
        }
        document.body.append(menu); menu.showPopover();
        const bounds = menu.getBoundingClientRect();
        menu.style.left = `${Math.max(6, Math.min(x, innerWidth - bounds.width - 6))}px`;
        menu.style.top = `${Math.max(6, Math.min(y, innerHeight - bounds.height - 6))}px`;
        menu.focus({ preventScroll: true });
        events = new AbortController(); const signal = events.signal;
        document.addEventListener('pointerdown', event => { if (!menu.contains(event.target as Node)) close(); }, { capture: true, signal });
        window.addEventListener('blur', () => close(), { signal });
        window.addEventListener('resize', () => close(), { signal });
        document.addEventListener('scroll', event => { if (!menu.contains(event.target as Node)) close(); }, { capture: true, signal });
        window.addEventListener('keydown', event => {
            // While a menu owns focus, editor shortcuts must not edit the scene behind it.
            event.stopImmediatePropagation();
            if (event.key === 'Escape') { event.preventDefault(); close(true); return; }
            if (event.key === 'Tab') { close(true); return; }
            const buttons = [...menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
            if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
                event.preventDefault();
                const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
                const index = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
                    : event.key === 'ArrowDown' ? (current + 1) % buttons.length : (current < 0 ? buttons.length - 1 : (current - 1 + buttons.length) % buttons.length);
                buttons[index]?.focus();
            } else if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                if (document.activeElement instanceof HTMLButtonElement && menu.contains(document.activeElement)) document.activeElement.click();
            }
        }, { capture: true, signal });
    };
    return { open, close };
}
