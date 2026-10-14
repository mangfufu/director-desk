import type { Clip } from '../model.ts';

/** Shared by motion insertion and the timeline drop preview. */
export function motionPlacement(clips: readonly Clip[], at: number, seconds: number, fps: number) {
    const duration = Math.max(1, Math.ceil(seconds * fps)) / fps;
    let start = Math.max(0, Math.round(at * fps) / fps);
    for (const clip of [...clips].sort((a, b) => a.start - b.start)) {
        if (start + duration <= clip.start) break;
        if (start < clip.end) start = Math.ceil(clip.end * fps) / fps;
    }
    return { start, end: start + duration };
}
