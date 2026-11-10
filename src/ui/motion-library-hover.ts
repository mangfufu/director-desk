import type { LibraryPreview } from '../animation/library-preview.ts';
import { t } from '../i18n/locale.ts';

export function bindMotionLibraryHover(host: HTMLElement) {
    let selected: HTMLElement | undefined, timer: ReturnType<typeof setTimeout> | undefined;
    let preview: LibraryPreview | undefined, token = 0;
    const popup = document.createElement('div'); popup.className = 'motion-hover-preview';
    popup.setAttribute('role','tooltip'); popup.hidden = true;
    const canvas = document.createElement('div'), title = document.createElement('strong'), status = document.createElement('span');
    canvas.className = 'motion-hover-canvas'; status.className = 'motion-hover-status';
    popup.append(canvas,title,status); document.body.append(popup);
    const clear = () => { token++; clearTimeout(timer); selected = undefined; popup.hidden = true; preview?.clear(); };
    const place = () => {
        if (!selected || popup.hidden) return;
        const r = selected.getBoundingClientRect();
        popup.style.left = Math.max(8,Math.min(r.right+12,innerWidth-popup.offsetWidth-8))+'px';
        popup.style.top = Math.max(8,Math.min(r.top,innerHeight-popup.offsetHeight-8))+'px';
    };
    const choose = (event: Event) => {
        const item = (event.target as HTMLElement).closest<HTMLElement>('[data-library-motion]');
        if (!item || item === selected) return;
        clear(); selected = item; const current = token;
        timer = setTimeout(async () => {
            if (current !== token || !item.isConnected) return;
            popup.hidden = false; title.textContent = item.dataset.motionName!; status.textContent = t('正在加载…');place();
            try {
                const { LibraryPreview } = await import('../animation/library-preview.ts');
                if (current !== token) return;
                preview ??= new LibraryPreview(); await preview.show(canvas,item.dataset.libraryMotion!);
                if (current === token) status.textContent = `${item.dataset.motionDuration} s`;
            } catch { if (current === token) status.textContent = t('预览暂不可用'); }
        }, 300);
    };
    const leave = (event: Event) => {
        const next = (event as FocusEvent).relatedTarget;
        if (selected && next instanceof Node && selected.contains(next)) return;
        clear();
    };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') clear(); };
    const changed = new MutationObserver(() => { if (selected && !selected.isConnected) clear(); });
    changed.observe(host,{childList:true,subtree:true});
    host.addEventListener('pointerover',choose); host.addEventListener('focusin',choose);
    host.addEventListener('pointerout',leave); host.addEventListener('focusout',leave);
    host.addEventListener('pointerdown',clear); host.addEventListener('dragstart',clear);
    document.addEventListener('keydown',key); window.addEventListener('resize',clear);
    window.addEventListener('blur',clear); document.addEventListener('visibilitychange',clear);
    return () => {
        clear(); preview?.dispose(); popup.remove();changed.disconnect();
        host.removeEventListener('pointerover',choose);host.removeEventListener('focusin',choose);
        host.removeEventListener('pointerout',leave);host.removeEventListener('focusout',leave);
        host.removeEventListener('pointerdown',clear);host.removeEventListener('dragstart',clear);
        document.removeEventListener('keydown',key);window.removeEventListener('resize',clear);
        window.removeEventListener('blur',clear);document.removeEventListener('visibilitychange',clear);
    };
}
