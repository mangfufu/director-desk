import type { AppContext } from '../app-context.ts';
import { download } from '../storage.ts';
import { jsonBlob } from '../files/json-blob.ts';
import { openOutput } from '../files/desktop-output.ts';

export async function saveProjectFile(ctx: AppContext, saveAs = false): Promise<boolean> {
    if (ctx.busy || ctx.engine.exporting) { ctx.toast('请先完成或取消当前任务，再保存项目'); return false; }
    if (ctx.draft) ctx.finishPath();
    if (ctx.history.pending || ctx.draft) { ctx.toast('请先结束当前编辑，再保存项目'); return false; }
    const document = ctx.scenes.document();
    const name = document.name.replace(/[<>:"/\\|?*]/g, '_') + '.director';
    ctx.busy = true; ctx.playing = false; ctx.updateTimeUI();
    try {
        const files = window.directorDesktop?.files;
        if (files) {
            const result = await files('project-destination', { name, ...(!saveAs && ctx.scenes.filePath ? { path: ctx.scenes.filePath } : {}) });
            if (!result.ok) throw Error(result.error || '保存失败');
            if (!result.data?.path) return false;
            const output = await openOutput({ path: result.data.path, overwrite: true }, name, 'project');
            try { await output.blob(jsonBlob(document), new AbortController().signal); }
            finally { await output.abort(); }
            ctx.scenes.markSaved(output.output.path, document);
        } else {
            download(jsonBlob(document), name);
            ctx.toast('工程下载已开始');
            // Initiated download is not confirmed persistence. Allow the requested
            // open/new continuation; keep unsaved protection on this document.
            return true;
        }
        ctx.dirty = ctx.scenes.dirty;
        await ctx.flushRecovery?.().catch(() => ctx.toast('工程已保存，自动备份失败', true));
        if (ctx.dirty) { ctx.toast('保存期间有新更改，请再次保存'); return false; }
        documentStatus('项目已保存');
        ctx.toast('项目已保存');
        return true;
    } catch (error) { ctx.toast((error as Error).message, true); return false; }
    finally { ctx.busy = false; ctx.updateTimeUI(); }
}
function documentStatus(text: string) { const status = document.querySelector('#save-status'); if (status) status.textContent = text; }
