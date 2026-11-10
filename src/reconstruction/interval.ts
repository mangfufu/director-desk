export function minimumAnalysisDuration(fps: number) {
    if (!Number.isFinite(fps) || fps < 1 || fps > 24) throw Error('分析帧率无效');
    return Math.ceil(20 / fps) / 10;
}

export function assertAnalysisDuration(seconds: number, fps: number) {
    const minimum = minimumAnalysisDuration(fps);
    if (!Number.isFinite(seconds) || seconds < minimum - 1e-9) throw Error(`请选择至少 ${minimum} 秒的视频区间`);
}

export function normalizeVideoRange(start: number, end: number, duration: number, minimum = .1) {
    duration = Math.max(0, Number.isFinite(duration) ? duration : 0);
    const span = Math.min(duration, minimum);
    start = Number.isFinite(start) ? Math.max(0, start) : 0;
    // A new, shorter video must not inherit an interval squeezed against its end.
    if (start > duration - span) start = 0;
    end = Math.min(duration, Math.max(start + span, Number.isFinite(end) ? end : duration));
    return { start, end };
}
