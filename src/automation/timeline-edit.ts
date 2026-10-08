import { clipRange, deleteClip, dragClipRange, setClipRange, splitClip, type TimelineSelection } from '../clip-editing.ts';
import type { Project } from '../model.ts';

/** Same operations as timeline handles and shortcuts, applied inside the normal transaction. */
export function editTimeline(project: Project, value: Record<string, unknown> | undefined) {
    if (!value || Object.keys(value).some(k => !['action', 'selection', 'time', 'delta', 'start', 'end'].includes(k))) throw Error('时间轴操作参数无效');
    const selection = value.selection as TimelineSelection;
    if (!selection || !['cut', 'action', 'path'].includes(selection.kind)) throw Error('需要明确的时间轴片段 selection');
    clipRange(project, selection);
    const numeric = (key: string) => { const n = value[key]; if (typeof n !== 'number' || !Number.isFinite(n)) throw Error(`时间轴 ${key} 必须为数字`); return n; };
    switch (value.action) {
        case 'split': splitClip(project, selection, numeric('time')); break;
        case 'remove': deleteClip(project, selection); break;
        case 'move': dragClipRange(project, selection, numeric('delta')); break;
        case 'extend': dragClipRange(project, selection, numeric('delta'), true); break;
        case 'range': setClipRange(project, selection, numeric('start'), numeric('end')); break;
        default: throw Error('未知时间轴操作');
    }
}
