import type { AppContext } from '../app-context.ts';
import { listVersions, saveVersion, loadVersion, editVersion } from '../versions/store.ts';
import { prepareDocumentModels } from '../scenes/document-models.ts';
import { download } from '../storage.ts';
import { openOutput } from '../files/desktop-output.ts';
export async function versionAction(ctx: AppContext, args: Record<string, unknown>) {
    const projectId = ctx.scenes.projectId;
    if (args.action === 'list') return { projectId, items: await listVersions(projectId) };
    if (args.action === 'save') return saveVersion(ctx.scenes.document(), String(args.name ?? ''));
    if (args.action === 'rename' || args.action === 'remove') {
        await editVersion(String(args.id), projectId, args.action === 'rename' ? String(args.name ?? '') : undefined); return { done: true };
    }
    const context = ctx.scenes.context, saved = await loadVersion(String(args.id), projectId);
    if (args.action === 'export') {
        const blob = new Blob([JSON.stringify(saved)], { type: 'application/json' });
        if (window.directorDesktop?.files) {
            const output = await openOutput({ path: args.path as string | undefined }, '历史版本.director', 'project');
            return output.blob(blob, new AbortController().signal);
        }
        download(blob, '历史版本.director'); return { status: 'download-requested' };
    }
    if (args.action !== 'restore') throw Error('未知版本操作');
    await prepareDocumentModels(ctx.engine.externalModels,saved);
    ctx.applyDocument(saved, context, '恢复历史版本', true);
    return { restored: args.id, projectId };
}
