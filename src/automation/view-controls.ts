import type { AppContext } from '../app-context.ts';
import { clipRange, type TimelineSelection } from '../clip-editing.ts';
import { editorSelection, setSelectedClips, setSelectedEntities, setSelectedTimeRange } from '../editor/timeline-selection.ts';

export function controlView(ctx: AppContext, args: Record<string, unknown>) {
    const state = () => ({ time: ctx.time, cameraId: ctx.preview, mode: ctx.mode, playing: ctx.playing, loop: ctx.loop, grid: ctx.engine.gridVisible, selection: editorSelection(ctx.project, ctx.selected) });
    if (!Object.keys(args).length) return state();
    if (args.time !== undefined && (typeof args.time !== 'number' || !Number.isFinite(args.time) || args.time < 0 || args.time > ctx.project.duration)) throw Error('预览时间超出戏段');
    if (args.cameraId && args.cameraId !== 'program' && !ctx.engine.cameras.has(String(args.cameraId))) throw Error('机位不存在');
    const ids = args.entityIds as string[] | undefined;
    for (const id of [...(ids ?? []), ...(args.entityId ? [args.entityId] : [])]) if (!ctx.project.entities.some(e => e.id === id)) throw Error('对象不存在');
    if (ids && args.clips !== undefined) throw Error('请选择对象或片段，不同时设置两种选区');
    const clips = args.clips as TimelineSelection[] | undefined;
    for (const clip of clips ?? []) { if (!['cut', 'action', 'path'].includes(clip.kind)) throw Error('片段类型无效'); clipRange(ctx.project, clip); }
    const range = args.timeRange as { start: number; end: number } | null | undefined;
    if (range && (!Number.isFinite(range.start) || !Number.isFinite(range.end) || range.start < 0 || range.end < range.start || range.end > ctx.project.duration)) throw Error('时间选区无效');
    if (args.focus === 'selected' && !(args.entityId || ids?.[0] || ctx.selected)) throw Error('没有可聚焦对象');
    if (args.time !== undefined) { ctx.playing = false; ctx.seek(args.time as number); }
    if (args.cameraId) { ctx.preview = String(args.cameraId); ctx.renderCameras(); }
    if (args.entityId) ctx.selectEntity(String(args.entityId));
    if (ids) { ctx.selectEntity(ids[0] ?? ''); setSelectedEntities(ids); }
    if (clips) setSelectedClips(clips);
    if (range !== undefined) setSelectedTimeRange(range);
    if (args.mode) ctx.setView(String(args.mode));
    if (args.focus === 'top') ctx.engine.viewTop();
    if (args.focus === 'home') ctx.engine.viewHome();
    if (args.focus === 'selected') ctx.engine.focus(String(args.entityId ?? ids?.[0] ?? ctx.selected));
    if (args.grid !== undefined) { ctx.engine.gridVisible = args.grid as boolean; ctx.engine.refreshHelpers(); }
    if (args.loop !== undefined) ctx.loop = args.loop as boolean;
    if (args.playing !== undefined) { if (args.playing && ctx.time >= ctx.project.duration) ctx.seek(0); ctx.playing = args.playing as boolean; }
    ctx.updateTimeUI(); ctx.renderPanels();
    return state();
}
