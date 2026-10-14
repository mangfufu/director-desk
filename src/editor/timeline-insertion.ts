export type TimeRange = { start: number; end: number };
const epsilon = 1e-8;

/** Choose an edge from the pointer, not from the dragged clip's leading edge. */
export function insertionPoint(ranges: readonly TimeRange[], pointer: number, fallback: number, tolerance = 0) {
    const edge = ranges.flatMap(r => [{time:r.start,side:'before' as const},{time:r.end,side:'after' as const}])
        .filter(e=>Math.abs(pointer-e.time)<=tolerance).sort((a,b)=>Math.abs(pointer-a.time)-Math.abs(pointer-b.time))[0];
    if(edge)return {start:edge.time,side:edge.side};
    const hit = ranges.find(r => pointer >= r.start && pointer < r.end);
    const side = hit ? (pointer < (hit.start + hit.end) / 2 ? 'before' : 'after') : undefined;
    const left = Math.max(0,...ranges.filter(r=>r.end<=pointer).map(r=>r.end));
    const right = Math.min(Infinity,...ranges.filter(r=>r.start>=pointer).map(r=>r.start));
    return { start: Math.max(0, hit ? (side === 'before' ? hit.start : hit.end) : Math.max(left,Math.min(right,fallback))), side };
}

/** Preserve durations and order, moving only neighbours that need to make room. */
export function makeInsertionRoom<T extends TimeRange>(stationary: readonly T[], inserted: readonly TimeRange[]) {
    const barriers = [...inserted].sort((a, b) => a.start - b.start);
    let previousEnd = 0;
    return [...stationary].sort((a, b) => a.start - b.start).map(range => {
        let start = Math.max(range.start, previousEnd);
        const length = range.end - range.start;
        let end = start === range.start ? range.end : start + length;
        for (const barrier of barriers) {
            if (end <= barrier.start + epsilon) { end = Math.min(end, barrier.start); break; }
            if (start < barrier.end) { start = barrier.end; end = start + length; }
        }
        previousEnd = end;
        return { ...range, start, end: previousEnd };
    });
}

export function planMotionInsertion<T extends TimeRange>(clips: readonly T[], at: number, seconds: number, fps: number, tolerance = 0) {
    const point = insertionPoint(clips, at, Math.round(at * fps) / fps,tolerance);
    const range = { start: point.start, end: point.start + Math.max(1, Math.ceil(seconds * fps - epsilon)) / fps };
    return { ...range, side: point.side, clips: makeInsertionRoom(clips, [range]) };
}
