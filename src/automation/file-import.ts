import type { AppContext } from '../app-context.ts';
import { identifyImportedDocument } from '../versions/identity.ts';
import { assertProject, clone, entity, type Vec3 } from '../model.ts';
import { readSceneDocument, projectForScene } from '../scenes/sequence-project.ts';
import { prepareDocumentModels } from '../scenes/document-models.ts';
import { mergeScene, type MergeSceneOptions } from '../scenes/merge-project.ts';
import { modelResourceId, type ModelResource } from '../resources/project-resources.ts';
import { rigStatus, type HumanoidRig } from '../resources/rig-definition.ts';
import { motionFromSource } from '../animation/import-user-motion.ts';
import { saveUserMotion } from '../animation/user-motion-store.ts';
import { desktopFile } from './file-delivery.ts';
import { assertStagingAsset, stagingMetadata } from '../building/staging-asset.ts';
import { saveStagingAsset } from '../building/staging-store.ts';

export interface ImportRequest {
    kind: 'project' | 'model' | 'motion' | 'staging'; path: string; dependencies?: string[];
    mode?: 'open' | 'merge'; sourceSceneId?: string; offset?: Vec3; timeOffset?: number;
    scheduling?: MergeSceneOptions['scheduling']; cuts?: MergeSceneOptions['cuts'];
    name?: string; entityKind?: 'actor' | 'prop'; libraryOnly?: boolean; position?: Vec3;
    unitScale?: number; orientation?: Vec3; appearance?: 'original' | 'white' | 'color';
    animationIndex?: number; rig?: HumanoidRig; license?: string; source?: string;
}
export async function importFile(ctx: AppContext, args: ImportRequest, signal: AbortSignal, check: () => void) {
    const context = ctx.scenes.context;
    const commit = (write: () => void) => {
        signal.throwIfAborted(); check(); ctx.busy = false;
        try { write(); } finally { ctx.busy = true; }
    };
    try {
        const file = await desktopFile('automation-read', args); signal.throwIfAborted();
        if (args.kind === 'staging') {
            const asset = JSON.parse(file.content!); assertStagingAsset(asset);
            if (args.name) asset.name = args.name;
            signal.throwIfAborted(); check(); await saveStagingAsset(asset);
            return { kind: args.kind, ...stagingMetadata(asset) };
        }
        if (args.kind === 'project') {
            const document = readSceneDocument(JSON.parse(file.content!));
            if (args.mode === 'merge') {
                const result = mergeScene(ctx.project, projectForScene(document, args.sourceSceneId ?? document.activeSceneId), {
                    offset: args.offset ?? [0, 0, 0], timeOffset: args.timeOffset ?? 0, scheduling: args.scheduling ?? 'keep', cuts: args.cuts ?? 'keep',
                });
                await ctx.engine.externalModels.prepare(result.project, signal);
                commit(() => { if (!ctx.change(() => { ctx.project = result.project; })) throw Error('工程合并未提交'); });
                return { kind: args.kind, mode: 'merge', name: file.name, entityIds: result.entityIds, warnings: result.warnings };
            }
            await identifyImportedDocument(document);
            await prepareDocumentModels(ctx.engine.externalModels, document, signal);
            commit(() => ctx.applyDocument(document, context, '打开工程', true));
            ctx.scenes.setFile(args.path, true); ctx.dirty = false;
            await ctx.flushRecovery?.().catch(() => ctx.toast('工程已打开，恢复副本更新失败', true));
            return { kind: args.kind, mode: 'open', name: document.name, scenes: document.scenes.map(s => ({ id: s.id, name: s.name })) };
        }
        const resource: ModelResource = { id: await modelResourceId(file.package!, signal), name: args.name ?? file.name!.replace(/\.[^.]+$/, ''),
            package: file.package!, copyright: '', license: args.license ?? '', source: args.source ?? '' };
        signal.throwIfAborted();
        if (args.kind === 'motion') {
            const { loadModelPackage } = await import('../resources/model-loader.ts');
            const loaded = await loadModelPackage(resource.package, signal);
            try {
                if (!loaded.inspection.bones.length) throw Error('文件没有人形骨架；非骨骼动画请作为模型导入');
                resource.copyright = loaded.inspection.copyright;
                const motion = motionFromSource(resource, loaded.inspection, args.animationIndex ?? 0);
                if (args.name) motion.name = args.name;
                if (args.rig) motion.data.rig = clone(args.rig);
                motion.data.unitScale = args.unitScale ?? 1; motion.data.orientation = args.orientation ?? [0, 0, 0];
                signal.throwIfAborted(); check(); await saveUserMotion(motion, resource);
                return { kind: args.kind, motionId: motion.id, name: motion.name, duration: motion.duration, rigStatus: rigStatus(motion.data.rig) };
            } finally { loaded.dispose(); }
        }
        const next = clone(ctx.project); next.version = 2; next.resources ??= [];
        if (!next.resources.some(r => r.id === resource.id)) next.resources.push(resource);
        await ctx.engine.externalModels.prepare(next, signal);
        const info = ctx.engine.externalModels.inspection(resource); resource.copyright = info.copyright;
        let id: string | undefined;
        if (!args.libraryOnly) {
            if (!info.meshes) throw Error('文件没有可放置网格；独立动作请使用 kind:motion');
            const e = entity(args.entityKind ?? (info.skins ? 'actor' : 'prop'), 'external-model', args.name ?? resource.name, args.position ?? [0, 0, 0]);
            e.external = { resourceId: resource.id, appearance: args.appearance ?? 'original', unitScale: args.unitScale ?? 1, orientation: args.orientation ?? [0, 0, 0] };
            if (e.kind === 'actor') {
                e.height = ctx.engine.externalModels.measure(resource, e.external.unitScale, e.external.orientation)[1];
                if (args.rig || rigStatus(info.rigSuggestion.rig).complete) e.external.rig = clone(args.rig ?? info.rigSuggestion.rig);
            }
            next.entities.push(e); id = e.id;
        }
        assertProject(next); await ctx.engine.externalModels.prepare(next, signal);
        commit(() => { if (!ctx.change(() => { ctx.project = next; if (id) ctx.selected = id; })) throw Error('模型导入未提交'); });
        return { kind: args.kind, resourceId: resource.id, entityId: id, name: resource.name, meshes: info.meshes, animations: info.animations, rigStatus: rigStatus(info.rigSuggestion.rig) };
    } finally { ctx.engine.externalModels.retain([ctx.project, ...ctx.history.undoStack, ...ctx.history.redoStack]); }
}
