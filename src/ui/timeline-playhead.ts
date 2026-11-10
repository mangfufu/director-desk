import './timeline-playhead.css';

let overlay: HTMLElement | undefined, line: HTMLElement | undefined;
let time = 0, pixels = 60, scroll = 0;
let transform = '';

/** Move one viewport-sized overlay, without invalidating every clip's inherited styles. */
export function updateTimelinePlayhead(value: number) {
    time = value;
    if (!line) return;
    const next = `translateX(${time * pixels - scroll}px)`;
    if (next !== transform) { line.style.transform = next; transform = next; }
}

export function layoutTimelinePlayhead() {
    const host = document.querySelector<HTMLElement>('#timeline-content');
    const ruler = host?.querySelector<HTMLElement>('.ruler');
    const timeline = host?.closest<HTMLElement>('.timeline');
    if (!host || !ruler || !timeline) return;
    if (!overlay?.isConnected) {
        overlay = document.createElement('div'); overlay.className = 'timeline-playhead-overlay';
        overlay.setAttribute('aria-hidden','true');
        line = document.createElement('div'); line.className = 'playhead-line';overlay.append(line);timeline.append(overlay);
        transform = '';
    }
    const label = host.querySelector<HTMLElement>('.track-label')!.getBoundingClientRect().width;
    // offsetTop is relative to .timeline, even when the toolbar wraps or curves are open.
    overlay.style.left = `${host.offsetLeft + label}px`;
    overlay.style.top = `${host.offsetTop}px`;
    overlay.style.width = `${Math.max(0, host.clientWidth - label)}px`;
    overlay.style.height = `${host.clientHeight}px`;
    pixels = 60 * Number((document.querySelector('#timeline-zoom') as HTMLSelectElement).value);
    scroll = host.scrollLeft;
    updateTimelinePlayhead(time);
}

export function scrollTimelinePlayhead(scrollLeft: number) {
    scroll = scrollLeft;updateTimelinePlayhead(time);
}
