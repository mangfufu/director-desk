import type { AppContext } from '../app-context.ts';
import { canRetarget } from '../resources/retarget-animation.ts';
import { planMotionInsertion } from '../editor/timeline-insertion.ts';
import { addLibraryMotion } from './motion-insertion.ts';
import { pixelsPerSecond, timelineTimeAt, extendTimelineView } from './timeline-zoom.ts';

/** Library drags share clip insertion rules, without committing hover previews. */
export function bindTimelineMotionDrop(ctx: AppContext) {
    const timeline = document.querySelector<HTMLElement>('#timeline-content')!;
    let motion: { id: string; name: string; duration: number } | undefined;
    let position: { x: number; y: number } | undefined, lane: HTMLElement | undefined, frame = 0, lastFrame = 0;
    let dirty = false, rangeKey = '';
    let range: ReturnType<typeof planMotionInsertion<{ id: string; start: number; end: number }>> | undefined;
    const ghost = document.createElement('div'), status = document.createElement('div'),marker=document.createElement('div');
    marker.className='timeline-insert-marker';
    ghost.className = 'motion-drop-ghost'; status.className = 'motion-drop-status';
    function clearLane() { ghost.remove();marker.remove();lane?.classList.remove('motion-drop-target'); lane = undefined; }
    function clearPreview() { clearLane(); status.remove(); }
    function stopScroll() { cancelAnimationFrame(frame); frame = 0; lastFrame = 0; }
    function reset() { stopScroll(); clearPreview(); motion = undefined; position = undefined; dirty = false; rangeKey = ''; }
    function targetAt(element: Element | null) {
        const target = element?.closest<HTMLElement>('.track-lane');
        if (!target || !timeline.contains(target)) return;
        const key = target.closest<HTMLElement>('[data-track-key]')?.dataset.trackKey;
        const entity = key?.startsWith('entity:') ? ctx.project.entities.find(e => e.id === key.slice(7)) : undefined;
        return { lane: target, entity };
    }
    const usable = (target: ReturnType<typeof targetAt>) => !!target?.entity && !target.entity.locked && canRetarget(target.entity)
        && !ctx.busy && !ctx.draft && !ctx.history.pending;
    function preview(x: number, y: number) {
        if (!motion || ctx.busy || ctx.draft || ctx.history.pending) { clearPreview(); return; }
        const rect = timeline.getBoundingClientRect();
        if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) { clearPreview(); return; }
        // Read layout before changing the overlay. Native dragover events can arrive
        // several times in a frame; only the latest pointer position is presented.
        const target = targetAt(document.elementFromPoint(x, y)), entity = target?.entity;
        const valid = usable(target), at = valid ? timelineTimeAt(x) : 0, pps = pixelsPerSecond();
        let text = entity?.locked ? '对象已锁定' : '拖入人物动作轨道';
        if (valid && target && entity) {
            const key = `${entity.id}:${ctx.revision}:${Math.round(at * ctx.project.fps)}`;
            if (rangeKey !== key) { rangeKey = key; range = planMotionInsertion(entity.clips, at, motion.duration, ctx.project.fps,8/pps); }
            if (lane !== target.lane) { clearLane(); lane = target.lane; lane.classList.add('motion-drop-target'); lane.append(ghost,marker); }
            const transform = `translateX(${range!.start * pps}px)`, width = `${(range!.end - range!.start) * pps}px`;
            if (ghost.style.transform !== transform) ghost.style.transform = transform;
            if (marker.style.transform !== transform) marker.style.transform=transform;
            if (ghost.style.width !== width) ghost.style.width = width;
            if (ghost.textContent !== motion.name) ghost.textContent = motion.name;
            text = `${range!.side==='before'?'插在前面 · ':range!.side==='after'?'插在后面 · ':''}${motion.name} · ${range!.start.toFixed(2)}—${range!.end.toFixed(2)} 秒`;
        } else clearLane();
        if (status.textContent !== text) status.textContent = text;
        if (!status.isConnected) document.body.append(status);
        // A bounded overlay avoids synchronous size measurements after DOM writes.
        status.style.transform = `translate3d(${Math.max(4, Math.min(x + 14, innerWidth - 300))}px,${Math.max(4, Math.min(y + 18, innerHeight - 60))}px,0)`;
        return valid && entity ? { id: entity.id, time: range!.start } : undefined;
    }
    function tick(now: number) {
        frame = 0;
        if (!motion || !position) return;
        const { x, y } = position, rect = timeline.getBoundingClientRect();
        if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) { lastFrame = 0; clearPreview(); return; }
        const dt = lastFrame ? Math.min(40, now - lastFrame) / 1000 : 0; lastFrame = now;
        const left = rect.left + timeline.querySelector('.track-label')!.getBoundingClientRect().width;
        const speed = x > rect.right - 42 ? Math.min(1, (x - rect.right + 42) / 42) * 600
            : x >= left && x < left + 42 ? -Math.min(1, (left + 42 - x) / 42) * 600 : 0;
        const vertical = y > rect.bottom - 28 ? 240 : y < rect.top + 28 ? -240 : 0;
        if (speed > 0) extendTimelineView(ctx, timelineTimeAt(rect.right) + 2);
        const beforeX = timeline.scrollLeft, beforeY = timeline.scrollTop;
        if (speed) timeline.scrollLeft += speed * dt;
        if (vertical) timeline.scrollTop += vertical * dt;
        if (dirty || beforeX !== timeline.scrollLeft || beforeY !== timeline.scrollTop) { dirty = false; preview(x, y); }
        if (speed || vertical) frame = requestAnimationFrame(tick);
        else lastFrame = 0;
    }
    function schedule() { dirty = true; if (!frame) frame = requestAnimationFrame(tick); }
    document.addEventListener('dragstart', event => {
        const item = (event.target as HTMLElement).closest<HTMLElement>('[data-library-motion]');
        if (!item) return;
        if (item.draggable === false || ctx.busy || ctx.draft || ctx.history.pending) { event.preventDefault(); return; }
        reset();
        motion = { id: item.dataset.libraryMotion!, name: item.dataset.motionName!, duration: Number(item.dataset.motionDuration) };
        event.dataTransfer?.setData('application/x-director-motion', motion.id);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
    });
    document.addEventListener('dragover', event => {
        if (!motion) return;
        position = { x: event.clientX, y: event.clientY };
        if (timeline.contains(event.target as Node)) {
            event.preventDefault();
            if (event.dataTransfer) event.dataTransfer.dropEffect = usable(targetAt(event.target as Element)) ? 'copy' : 'none';
            schedule();
        } else { stopScroll(); clearPreview(); }
    });
    // Accept entry as well as movement, including immediate release at an edge.
    timeline.addEventListener('dragenter', event => {
        if(!motion)return;
        event.preventDefault();
        if(event.dataTransfer)event.dataTransfer.dropEffect=usable(targetAt(event.target as Element))?'copy':'none';
    });
    timeline.addEventListener('scroll', () => { if (motion && position) schedule(); }, { passive: true });
    timeline.addEventListener('dragleave', event => {
        if (!timeline.contains(event.relatedTarget as Node | null)) { stopScroll(); clearPreview(); }
    });
    timeline.addEventListener('drop', event => {
        if (!motion) return;
        event.preventDefault();
        const target = preview(event.clientX, event.clientY), id = motion.id;
        reset();
        if (target) void addLibraryMotion(ctx, id, target.id, target.time, true);
    });
    document.addEventListener('drop', reset);
    document.addEventListener('dragend', reset);
    document.addEventListener('keydown', event => { if (event.key === 'Escape') reset(); });
    window.addEventListener('blur', reset);
}
