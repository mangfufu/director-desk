import { ModelRecording, recordingError, type RecordingAction } from '../editor/model-recording.ts';
import { simplifyFreehand, timeFreehand } from '../editor/freehand-path.ts';
import type { Project, Vec3 } from '../model.ts';

export function editRoute(project: Project, id: string, action: string, input: Record<string, unknown> | undefined) {
    const target = project.entities.find(e => e.id === id); if (!target) throw Error('对象不存在');
    if (target.locked) throw Error('对象已锁定');
    if (target.handBinding || target.structureLink || project.entities.some(e => e.structureLink?.parentId === id)) throw Error('请先解除手持或模块连接');
    if (!input || typeof input !== 'object') throw Error('需要路径操作 patch');
    const time = input.time ?? 0;
    if (typeof time !== 'number' || !Number.isFinite(time) || time < 0) throw Error('起始时间无效');
    if (action === 'draw-path') {
        if (Object.keys(input).some(k => !['time', 'duration', 'points', 'tolerance'].includes(k))) throw Error('绘制路径参数无效');
        if (!Array.isArray(input.points) || input.points.length > 10000) throw Error('路径需要坐标点列表');
        if (target.camera && target.camera.mode !== 'free') throw Error('请先解除摄影机跟随，再绘制机身路径');
        const points = simplifyFreehand(input.points as Vec3[], input.tolerance as number | undefined);
        if (points.length < 2) throw Error('路径至少需要两个不同位置');
        target.path = { smooth: false, points: timeFreehand(points, time, Number(input.duration)) };
        project.duration = Math.max(project.duration, time + Number(input.duration));
        return;
    }
    if (Object.keys(input).some(k => !['time', 'mode', 'segments'].includes(k))) throw Error('录制路径参数无效');
    const error = recordingError(target); if (error) throw Error(error);
    const segments = input.segments as { duration: number; keys: string[]; forward: Vec3 }[];
    if (!Array.isArray(segments) || !segments.length || segments.length > 1000) throw Error('录制需要 segments');
    let total = 0;
    for (const segment of segments) {
        if (!segment || Object.keys(segment).some(k => !['duration', 'keys', 'forward'].includes(k)) || !Number.isFinite(segment.duration) || segment.duration <= 0
            || !Array.isArray(segment.keys) || segment.keys.some(k => !['KeyW','KeyA','KeyS','KeyD','KeyR','KeyF','ShiftLeft','ShiftRight'].includes(k))
            || !Array.isArray(segment.forward) || segment.forward.length !== 3 || !segment.forward.every(Number.isFinite)) throw Error('录制片段格式无效');
        total += Math.round(segment.duration * project.fps);
    }
    if (total < 1 || total > 100000 || time * project.fps + total > 100000) throw Error('单次录制需要 1—100000 帧；长片请分段编辑路径');
    const recording = new ModelRecording(target, time, project.fps, (input.mode ?? 'auto') as RecordingAction, project);
    for (const segment of segments) {
        const keys = new Set(segment.keys);
        for (let frame = 0, count = Math.round(segment.duration * project.fps); frame < count; frame++) recording.advance(keys, segment.forward);
    }
    Object.assign(target, recording.entity); project.duration = Math.max(project.duration, recording.time);
}
