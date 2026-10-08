import type { AppContext } from '../app-context.ts';
import { DEFAULT_DEPTH_VIDEO } from '../cinematography/depth-video.ts';
import { clone, outputSize, type PromptMode } from '../model.ts';
import { scenePromptFile } from '../production/prompts.ts';
import { projectForScene } from '../scenes/sequence-project.ts';
import { planVideoExports, type ExportSelection, type VideoSettings } from '../exporting/plan.ts';
import { runVideoExports } from '../exporting/batch.ts';
import { productionEntries } from '../production/bundle.ts';
import { createZip } from '../production/zip.ts';
import { safeFilename } from '../production/notes.ts';
import { openOutput, type FileDestination } from './file-delivery.ts';

export interface FileExportRequest extends FileDestination {
    kind: 'project' | 'screenshot' | 'video' | 'depth-video' | 'bundle' | 'prompt';
    promptMode?: PromptMode; sceneId?: string;
    scenes?: ExportSelection[]; start?: number; end?: number; size?: number;
    fps?: number; format?: 'mp4' | 'webm'; monochrome?: boolean; cameraId?: string; time?: number;
}
export async function exportFiles(ctx: AppContext, args: FileExportRequest, signal: AbortSignal, progress: (value: number) => void,
    report: (value: unknown) => void) {
    const video = args.kind === 'video' || args.kind === 'depth-video';
    const invalid = video ? ['time'] : args.kind === 'screenshot' ? ['scenes', 'start', 'end', 'fps', 'format', 'monochrome'] : ['scenes', 'start', 'end', 'time', 'fps', 'format', 'size', 'monochrome', 'cameraId'];
    for (const key of invalid) if (args[key as keyof FileExportRequest] !== undefined) throw Error(`${args.kind} 不支持 ${key}`);
    if (args.kind !== 'prompt' && (args.promptMode !== undefined || args.sceneId !== undefined)) throw Error('promptMode/sceneId 仅用于提示词导出');
    if (args.path && (args.directory || args.filename)) throw Error('path 与 directory/filename 不能同时使用');
    if (args.scenes && args.filename) throw Error('批量导出请在各 scenes 项内设置 filename');
    const document = ctx.scenes.document(), sceneId = document.activeSceneId, project = projectForScene(document, sceneId);
    const completed: { sceneId?: string; saved: boolean; path: string; filename: string }[] = [];
    report({ files: completed });
    const save = async (blob: Blob, name: string) => {
        const output = await openOutput(args, name, args.kind);
        try { completed.push(await output.blob(blob, signal)); } finally { await output.abort(); }
        return { files: completed };
    };
    if (args.kind === 'prompt') {
        const id = args.sceneId ?? sceneId, scene = document.scenes.find(s => s.id === id);
        if (!scene) throw Error('戏段不存在');
        const file = scenePromptFile(projectForScene(document, id), scene.name, args.promptMode);
        if (!file) throw Error('该戏段尚未保存此模式的提示词');
        return save(file.data as Blob, file.name);
    }
    if (args.kind === 'project') {
        const result = await save(new Blob([JSON.stringify(document, null, 2)], { type: 'application/json' }), safeFilename(document.name) + '.director');
        ctx.scenes.markSaved(result.files[0].path); ctx.dirty = false;
        await ctx.flushRecovery?.().catch(() => ctx.toast('工程已保存，恢复副本更新失败', true)); return result;
    }
    if (args.kind === 'bundle') return save(await createZip(await productionEntries(project, undefined, document), signal, (done, total) => progress(done / total)), safeFilename(project.name) + '-制作素材包.zip');
    if (args.kind === 'screenshot') {
        const before = ctx.engine.time, [width, height] = outputSize(project.aspect, args.size ?? 1280);
        try {
            const time = args.time ?? ctx.time;
            if (!Number.isFinite(time) || time < 0 || time > project.duration) throw Error('截图时间超出戏段');
            const cameraId = args.cameraId ?? 'program';
            if (cameraId !== 'program' && !project.entities.some(e => e.id === cameraId && e.camera)) throw Error('摄影机不存在');
            await ctx.engine.prepareOutput(time, signal);
            const canvas = ctx.engine.renderOutput(time, width, height, cameraId, project.depthVideo?.enabled ? project.depthVideo : null);
            const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(Error('截图失败')), 'image/png'));
            return await save(blob, safeFilename(project.name) + '.png');
        } finally { ctx.engine.restorePreview(before); }
    }
    const selections = args.scenes ?? [{ sceneId, filename: args.filename ?? project.name }];
    if (args.path && selections.length !== 1) throw Error('批量导出请使用 directory，不使用单个文件 path');
    const format = args.format ?? 'mp4';
    const settings: VideoSettings = { size: args.size ?? 1280, fps: args.fps ?? 'scene', format, monochrome: args.monochrome ?? false,
        ...(args.kind === 'depth-video' ? { depth: clone(project.depthVideo ?? DEFAULT_DEPTH_VIDEO) } : {}) };
    const range = args.start !== undefined || args.end !== undefined || args.cameraId !== undefined ? {
        start: args.start ?? 0, end: args.end ?? projectForScene(document, selections[0].sceneId).duration, cameraId: args.cameraId ?? 'program',
    } : undefined;
    const jobs = planVideoExports(document.scenes.map(s => ({ id: s.id, name: s.name, ...s.state })), selections, settings, range);
    let output: Awaited<ReturnType<typeof openOutput>> | undefined;
    const { exportVideo } = await import('../export.ts');
    await runVideoExports(ctx.engine, jobs, id => projectForScene(document, id), {
        async open(job) { output = await openOutput({ path: args.path, directory: args.directory, overwrite: args.overwrite }, job.filename, args.kind); return output.handle; },
        async save(_job, blob) { if (blob) await output!.blob(blob, signal); if (!output!.output.saved) throw Error('视频写入未完成'); return output!.output.filename; },
        async discard() { await output?.abort(); },
    }, signal, (_job, _index, fraction) => progress(fraction), job => { completed.push({ sceneId: job.sceneId, ...output!.output }); report({ files: completed }); }, exportVideo);
    return { files: completed };
}
