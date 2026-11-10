export type TimeRange = { start: number; end: number };
const epsilon = 1e-8;

/** Choose an edge from the pointer, not from the dragged clip's leading edge. */
export function insertionPoint(ranges: readonly TimeRange[], pointer: number, fallback: number, tolerance = 0) {
    let edge: { time:number; side:'before'|'after' } | undefined;
    let distance=Infinity,left=0,right=Infinity,hit:TimeRange|undefined;
    for(const range of ranges){
        const before=Math.abs(pointer-range.start),after=Math.abs(pointer-range.end);
        if(before<=tolerance && before<distance){edge={time:range.start,side:'before'};distance=before;}
        if(after<=tolerance && after<distance){edge={time:range.end,side:'after'};distance=after;}
        if(!hit && pointer>=range.start && pointer<range.end)hit=range;
        if(range.end<=pointer)left=Math.max(left,range.end);
        if(range.start>=pointer)right=Math.min(right,range.start);
    }
    if(edge)return {start:edge.time,side:edge.side};
    const side = hit ? (pointer < (hit.start + hit.end) / 2 ? 'before' : 'after') : undefined;
    return { start: Math.max(0, hit ? (side === 'before' ? hit.start : hit.end) : Math.max(left,Math.min(right,fallback))), side };
}

/** Preserve durations and order, moving only neighbours that need to make room. */
export function makeInsertionRoom<T extends TimeRange>(stationary: readonly T[], inserted: readonly TimeRange[]) {
    const barriers = [...inserted].sort((a, b) => a.start - b.start);
    let previousEnd = 0, barrierIndex = 0;
    return [...stationary].sort((a, b) => a.start - b.start).map(range => {
        let start = Math.max(range.start, previousEnd);
        const length = range.end - range.start;
        let end = start === range.start ? range.end : start + length;
        while (barrierIndex < barriers.length) {
            const barrier = barriers[barrierIndex];
            if (end <= barrier.start + epsilon) { end = Math.min(end, barrier.start); break; }
            if (start < barrier.end) { start = barrier.end; end = start + length; }
            // Later stationary clips cannot reach a barrier already behind this one.
            barrierIndex++;
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
