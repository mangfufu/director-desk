import { extensionHost } from '../plugins/extension-host.ts';
import { openOutput } from './file-delivery.ts';
import { editSettings } from './settings.ts';
import { controlApplication } from './application-controls.ts';
import { placementOperation } from './placement.ts';
import { editMotionLibrary } from './motion-library.ts';
import { controlView } from './view-controls.ts';
import { sameProjectData } from '../resources/package-validation.ts';
import { DEFAULT_DEPTH_VIDEO } from '../cinematography/depth-video.ts';
import { readScene, type SceneReadOptions } from './read-scene.ts';
import {importMedia} from '../media/source.ts';
import {defaultSurfaceLayer} from '../media/model.ts';
import type { AppContext } from '../app-context.ts';
import { GEOMETRY_ASSET_IDS } from '../assets/creation-mode.ts';
import { queryAssetCatalog, type AssetQuery } from '../assets/catalog-query.ts';
import { clone, outputSize, uid } from '../model.ts';
import { applyOperationsWithResources, changeSummary, type EditOperation } from './edits.ts';
import { motionPresets } from '../animation/motion-catalog.ts';
import { getUserMotion, listUserMotions } from '../animation/user-motion-store.ts';
import { isUserMotion, type UserMotionAsset } from '../animation/user-motion.ts';
import { rigStatus } from '../resources/rig-definition.ts';
import { checkPathSurfaces, pathSurfaceModels } from '../spatial/path-surfaces.ts';
import { scanSpatialRange, type SpatialRangeOptions } from '../spatial/range.ts';
import { download } from '../storage.ts';
import { productionEntries } from '../production/bundle.ts';
import { createZip } from '../production/zip.ts';
import { safeFilename } from '../production/notes.ts';
import { validateToolInput } from './validate.ts';
import { toolHelp } from './contract.ts';
import { continueScene, continuitySummary } from '../scenes/continue-scene.ts';
import { editIndependentScene } from './scene-tools.ts';
import { readBuiltinSkill } from './skill.ts';
import { editLocations } from './edit-locations.ts';
import { recordEdits } from './edit-journal.ts';
import { arrangementBounds } from '../editor/arrangement-bounds.ts';
import { createStagingAsset, insertStagingAsset, stagingMetadata } from '../building/staging-asset.ts';
import { getStagingAsset, listStagingAssets, saveStagingAsset, renameStagingAsset, removeStagingAsset } from '../building/staging-store.ts';
import type { Vec3 } from '../model.ts';
import { importFile, type ImportRequest } from './file-import.ts';
import { exportFiles, type FileExportRequest } from './file-export.ts';
import { versionAction } from './versions.ts';
import { pluginAction } from './plugins.ts';
import { navigationPlan } from './navigation.ts';
export interface ToolResult { ok: boolean; data?: any; error?: string; revision?: number }
interface ToolService { call(name: string, args?: Record<string, unknown>): Promise<ToolResult> }
const services = new WeakMap<AppContext, ToolService>();
export function createToolService(ctx: AppContext): ToolService {
    const existing = services.get(ctx); if (existing) return existing;
    extensionHost(ctx,execute);
    // A new renderer must not accept a revision captured before a reload/reconnect.
    let revision = Date.now() * 1000 + Math.floor(Math.random() * 1000), fingerprint = '', sequence = Promise.resolve<unknown>(null);
    const receipts = new Map<string, { args: string; result: unknown }>();
    const previews = new Map<string, { revision: number; operations: EditOperation[]; userMotions: Map<string, UserMotionAsset> }>();
    const jobs = new Map<string, { id: string; status: string; progress: number; result?: unknown; error?: string; aborter: AbortController }>();
    function currentRevision() { const next = JSON.stringify([ctx.scenes?.context, ctx.revision]); if (next !== fingerprint) { fingerprint = next; revision++; } return revision; }
    function idle() { if (ctx.busy || ctx.draft || ctx.history.pending || ctx.engine.exporting) throw new Error('当前正在编辑、绘制或执行长任务，请等待或取消'); }
    function checkRevision(value: unknown) { const actual = currentRevision(); if (value !== actual) throw new Error(`REVISION_CONFLICT：请求版本 ${value}，当前版本 ${actual}；请重新读取工程`); }
    function job(run: (signal: AbortSignal, progress: (p: number) => void, report: (value: unknown) => void) => Promise<unknown>) {
        idle(); ctx.busy = true; ctx.playing = false; ctx.updateTimeUI();
        const id = uid(), task = { id, status: 'running', progress: 0, aborter: new AbortController() } as typeof jobs extends Map<string, infer V> ? V : never;
        jobs.set(id, task);
        void run(task.aborter.signal, p => { task.progress = p; }, value => { task.result = value; }).then(result => { task.result = result; task.status = 'completed'; task.progress = 1; })
            .catch(e => { task.status = e.name === 'AbortError' ? 'canceled' : 'failed'; task.error = e.message; })
            .finally(() => { ctx.busy = false; ctx.updateTimeUI(); if (jobs.size > 30) jobs.delete(jobs.keys().next().value!); });
        return { jobId: id, status: task.status };
    }
    async function execute(name: string, args: Record<string, unknown>): Promise<unknown> {
        validateToolInput(name, args);
        if (name === 'director_versions' || name === 'director_plugins' || name === 'director_navigate') {
            const read = ['list','read'].includes(String(args.action));
            const run = () => name === 'director_versions' ? versionAction(ctx,args) : pluginAction(ctx,args,execute);
            if (read) return run();
            if (typeof args.requestId !== 'string' || !args.requestId || args.requestId.length > 180) throw Error('需要唯一 requestId');
            const key = name + ':' + args.requestId, encoded = JSON.stringify(args), receipt = receipts.get(key);
            if (receipt) {
                if (receipt.args !== encoded) throw Error('requestId 已用于不同操作');
                const failure = receipt.result as { pluginFailure?: string };
                if (failure?.pluginFailure) throw Error(failure.pluginFailure);
                return receipt.result;
            }
            idle();
            if (name !== 'director_plugins' || args.action === 'run') checkRevision(args.revision);
            ctx.playing = false;
            if (name === 'director_navigate') {
                const result = job(async (signal,progress) => {
                    progress(.1);
                    const planned = await navigationPlan(ctx,args,signal); signal.throwIfAborted(); progress(.8);
                    ctx.busy = false;
                    const applied = await execute('director_apply',{revision:args.revision,requestId:'nav:'+uid(),operations:planned.operations});
                    return {...applied as object,timing:planned.timing,people:planned.people,movingObstacleIds:planned.movingObstacleIds};
                });
                receipts.set(key,{args:encoded,result}); if(receipts.size>200)receipts.delete(receipts.keys().next().value!);
                return result;
            }
            let result: unknown;
            try {
                // Plugin SDK calls enter execute directly and retain normal per-edit checks.
                ctx.busy = name === 'director_versions';
                result = await run();
                if (name === 'director_versions') result = {...result as object,revision:currentRevision()};
                receipts.set(key,{args:encoded,result});
                return result;
            } catch (error) {
                // A plugin may have completed several ordinary edits before failing. Never replay it silently.
                if (name === 'director_plugins' && args.action === 'run') receipts.set(key,{args:encoded,result:{pluginFailure:(error as Error).message}});
                throw error;
            } finally {
                if (name === 'director_versions') ctx.busy = false;
                ctx.updateTimeUI();
                if (receipts.size > 200) receipts.delete(receipts.keys().next().value!);
                ctx.engine.externalModels.retain([ctx.project,...ctx.history.undoStack,...ctx.history.redoStack]);
            }
        }
        if (name === 'director_place') {
            if (typeof args.requestId !== 'string' || !args.requestId || args.requestId.length > 180) throw Error('需要唯一 requestId（最多 180 字符）');
            const key = 'place:' + args.requestId, encoded = JSON.stringify(args), receipt = receipts.get(key);
            if (receipt) { if (receipt.args !== encoded) throw Error('requestId 已用于不同操作'); return receipt.result; }
            idle(); checkRevision(args.revision);
            const operation = placementOperation(ctx, args);
            const result = await execute('director_apply', { revision: args.revision, requestId: key, operations: [operation] });
            receipts.set(key, { args: encoded, result }); if (receipts.size > 200) receipts.delete(receipts.keys().next().value!);
            return result;
        }
        if (name === 'director_settings' || name === 'director_motion_library' || name === 'director_application') {
            const read = ['read','list','state'].includes(String(args.action));
            const run = () => name === 'director_settings' ? editSettings(args) : name === 'director_application' ? controlApplication(args) : editMotionLibrary(args);
            if (read) return run();
            if (typeof args.requestId !== 'string' || !args.requestId || args.requestId.length > 200) throw Error('需要唯一 requestId');
            const key = name + ':' + args.requestId, encoded = JSON.stringify(args), receipt = receipts.get(key);
            if (receipt) { if (receipt.args !== encoded) throw Error('requestId 已用于不同操作'); return receipt.result; }
            idle(); ctx.busy = true;
            try {
                const result = await run(); receipts.set(key, { args: encoded, result });
                if (receipts.size > 200) receipts.delete(receipts.keys().next().value!);
                return result;
            } finally { ctx.busy = false; ctx.updateTimeUI(); }
        }

        if (name === 'director_import' || name === 'director_export' && typeof window !== 'undefined' && window.directorDesktop?.files) {
            if (args.requestId !== undefined && (typeof args.requestId !== 'string' || !args.requestId || args.requestId.length > 200)) throw Error('需要唯一 requestId');
            const key = args.requestId ? name + ':' + args.requestId : '', encoded = JSON.stringify(args), receipt = key ? receipts.get(key) : undefined;
            if (receipt) { if (receipt.args !== encoded) throw Error('requestId 已用于不同操作'); return receipt.result; }
            if (name === 'director_import') checkRevision(args.revision);
            const result = name === 'director_import'
                ? job(async signal => {
                    const before = ctx.project;
                    const imported = await importFile(ctx, args as unknown as ImportRequest, signal, () => checkRevision(args.revision));
                    const changeId = !sameProjectData(before, ctx.project) ? uid() : undefined;
                    if (changeId) recordEdits({ id: changeId, sceneId: ctx.scenes.context.sceneId,
                        sceneName: ctx.scenes.list().find(s => s.id === ctx.scenes.context.sceneId)?.name ?? ctx.project.name,
                        created: Date.now(), label: args.kind === 'project' ? args.mode === 'merge' ? '合并工程' : '打开工程' : '导入模型', locations: editLocations(before, ctx.project) });
                    return { ...imported, revision: currentRevision(), ...(changeId ? { changeId } : {}) };
                })
                : job((signal, progress, report) => exportFiles(ctx, args as unknown as FileExportRequest, signal, progress, report));
            if (key) { receipts.set(key, { args: encoded, result }); if (receipts.size > 200) receipts.delete(receipts.keys().next().value!); }
            return result;
        }
        if (name === 'director_staging') {
            if (args.action === 'list') return listStagingAssets(args.query as string | undefined, args.offset as number | undefined, args.limit as number | undefined);
            if (args.action === 'read') {
                const item = await getStagingAsset(String(args.id));
                return { ...stagingMetadata(item), entities: item.scene.entities.filter(e => item.entityIds.includes(e.id)).map(e => ({ id: e.id, name: e.name, asset: e.asset, position: e.position })) };
            }
            idle();
            if (typeof args.requestId !== 'string' || !args.requestId || args.requestId.length > 200) throw Error('需要唯一 requestId');
            const encoded = JSON.stringify(args), key = 'staging:' + args.requestId, existing = receipts.get(key);
            if (existing) { if (existing.args !== encoded) throw Error('requestId 已用于不同参数'); return existing.result; }
            checkRevision(args.revision);
            let result: unknown;
            if (args.action === 'save') {
                const asset = createStagingAsset(ctx.project, args.entityIds as string[], String(args.name ?? ''));
                result = { ...await saveStagingAsset(asset), entityIds: asset.entityIds, revision: currentRevision() };
            } else if (args.action === 'rename') result = await renameStagingAsset(String(args.id), String(args.name ?? ''));
            else if (args.action === 'remove') { await removeStagingAsset(String(args.id)); result = { removed: args.id }; }
            else if (args.action === 'insert') {
                const before = ctx.project; ctx.busy = true; ctx.playing = false;
                try {
                    const asset = await getStagingAsset(String(args.id)), inserted = insertStagingAsset(before, asset, args.position as Vec3 | undefined);
                    await ctx.engine.externalModels.prepare(inserted.project); checkRevision(args.revision);
                    if (ctx.project !== before || ctx.draft || ctx.history.pending) throw Error('工程已变化，请重新插入');
                    ctx.busy = false;
                    if (!ctx.change(() => { ctx.project = inserted.project; })) throw Error('布景插入失败');
                    const changeId = uid();
                    if (ctx.scenes) recordEdits({ id: changeId, sceneId: ctx.scenes.context.sceneId, sceneName: ctx.scenes.list().find(s => s.id === ctx.scenes.context.sceneId)!.name, created: Date.now(), label: '插入布景', locations: editLocations(before, ctx.project) });
                    result = { revision: currentRevision(), committed: true, addedIds: inserted.addedIds, summary: changeSummary(before, ctx.project), changeId };
                } finally { ctx.busy = false; ctx.engine.externalModels.retain([ctx.project, ...ctx.history.undoStack, ...ctx.history.redoStack]); ctx.updateTimeUI(); }
            } else if (args.action === 'export') {
                const item = await getStagingAsset(String(args.id)), blob = new Blob([JSON.stringify(item)], { type: 'application/json' }), filename = safeFilename(item.name) + '.staging';
                if (typeof window !== 'undefined' && window.directorDesktop?.files) {
                    const output = await openOutput(args, filename, 'staging');
                    try { result = await output.blob(blob, new AbortController().signal); } finally { await output.abort(); }
                } else {
                    if (['path','directory','filename','overwrite'].some(k => args[k] !== undefined)) throw Error('指定路径需要桌面版');
                    download(blob, filename); result = { status: 'save-requested' };
                }
            } else throw Error('未知布景操作');
            receipts.set(key, { args: encoded, result }); if (receipts.size > 200) receipts.delete(receipts.keys().next().value!); return result;
        }
        if (name === 'director_arrange') {
            const encoded = JSON.stringify(args), key = 'arrange:' + args.requestId, existing = receipts.get(key);
            if (existing) { if (existing.args !== encoded) throw Error('requestId 已用于不同参数'); return existing.result; }
            idle(); checkRevision(args.revision);
            const { revision, requestId, ...patch } = args;
            if (patch.action !== 'array') patch.bounds = arrangementBounds(ctx.engine, patch.entityIds as string[]);
            const result = await execute('director_apply', { revision, requestId, operations: [{ operation: 'arrange', patch }] });
            receipts.set(key, { args: encoded, result }); if (receipts.size > 200) receipts.delete(receipts.keys().next().value!);
            return result;
        }
        if (name === 'director_skill') {
            if (args.action === 'list') {
                const { name, version, files } = readBuiltinSkill();
                return { skills: [{ id: 'builtin', name, version, files, enabled: true, builtin: true }] };
            }
            if (args.id && args.id !== 'builtin') throw Error('网页版仅提供内置操作说明；自定义技能请在桌面版管理');
            return readBuiltinSkill(args.knownVersion as string | undefined, args.path as string | undefined);
        }
        if(name==='director_media'){
            if(args.action==='list')return {revision:currentRevision(),media:(ctx.project.media??[]).map(({data:_data,...r})=>r),runtime:ctx.engine.surfaces.textures.statistics()};
            if(args.action==='surfaces'){const root=ctx.engine.models.get(String(args.entityId));if(!root)throw Error('对象不存在');return {revision:currentRevision(),entityId:args.entityId,surfaces:ctx.engine.surfaces.describe(root)};}
            idle();if(typeof args.requestId!=='string'||!args.requestId||args.requestId.length>200)throw Error('需要唯一 requestId');
            if(args.path!==undefined)throw Error('本机路径导入需要桌面版；网页版请用材质面板导入');
            if(typeof args.data!=='string'||typeof args.name!=='string'||typeof args.mime!=='string'||!args.data.startsWith('data:'+args.mime+';base64,'))throw Error('媒体内容无效');
            ctx.busy=true;ctx.playing=false;ctx.updateTimeUI();
            try{const response=await fetch(args.data);const blob=await response.blob();const resource=await importMedia(new File([blob],args.name,{type:args.mime}));
                const encoded=JSON.stringify({tool:name,resource:resource.id,entityId:args.entityId,name:resource.name,revision:args.revision}),receipt=receipts.get(args.requestId);
                if(receipt){if(receipt.args!==encoded)throw Error('requestId 已用于不同操作');return receipt.result;}checkRevision(args.revision);
                const target=args.entityId===undefined?undefined:ctx.project.entities.find(e=>e.id===args.entityId);if(args.entityId!==undefined&&(!target||target.locked||target.camera))throw Error('承载对象不存在、被锁定或为摄影机');
                ctx.busy=false;const committed=ctx.change(()=>{ctx.project.media??=[];if(!ctx.project.media.some(r=>r.id===resource.id))ctx.project.media.push(resource);if(target)(target.surface??={layers:[]}).layers.push(defaultSurfaceLayer(resource.id));},false);if(!committed)throw Error('媒体导入未提交，请检查当前对象及参数');
                const result={revision:currentRevision(),resourceId:resource.id,name:resource.name,width:resource.width,height:resource.height,duration:resource.duration,entityId:target?.id};receipts.set(args.requestId,{args:encoded,result});if(receipts.size>200)receipts.delete(receipts.keys().next().value!);return result;
            }finally{ctx.busy=false;ctx.updateTimeUI();}
        }
        if (name === 'director_help') return toolHelp(args.names as string[] | undefined, { topic: args.topic as string | undefined, full: args.full as boolean | undefined });
        if (name === 'director_scene') {
            if (args.action === 'list') return { revision: currentRevision(), sceneContext: ctx.scenes.context, scenes: ctx.scenes.list() };
            if (args.action === 'read') return { revision: currentRevision(), ...ctx.scenes.readScene(args.sceneId as string | undefined, args) };
            idle();
            if (typeof args.requestId !== 'string' || !args.requestId || args.requestId.length > 200) throw Error('需要唯一 requestId');
            const encoded = JSON.stringify({ name, args }), receipt = receipts.get(args.requestId);
            if (receipt) { if (receipt.args !== encoded) throw Error('requestId 已用于不同操作'); return receipt.result; }
            checkRevision(args.revision);
            const context = ctx.scenes.context;
            ctx.busy = true; ctx.playing = false;
            try {
                if (args.action === 'continue' && args.sceneId !== undefined && args.sceneId !== context.sceneId) throw Error('请先切换到要接拍的来源戏段');
                if (args.action === 'switch') ctx.switchScene(String(args.sceneId ?? context.sceneId), context);
                else {
                    const document = ctx.scenes.document();
                    const next = args.action === 'continue' ? await continueScene(ctx.engine, document, String(args.name ?? ''), args.newSceneId as string | undefined) : editIndependentScene(document, args);
                    checkRevision(args.revision);
                    ctx.applyDocument(next, context, ({ 'new-project': '新建工程', create: '新增戏段', copy: '复制戏段', continue: '从末帧接拍', rename: '重命名戏段', reorder: '排序戏段', remove: '删除戏段' } as Record<string, string>)[String(args.action)], args.action === 'new-project');
                    if (args.action === 'new-project') { ctx.scenes.setFile(); ctx.dirty = true; }
                    const sceneId = ['rename', 'remove'].includes(String(args.action)) ? String(args.sceneId ?? context.sceneId) : ctx.scenes.context.sceneId;
                    const scene = next.scenes.find(s => s.id === sceneId) ?? document.scenes.find(s => s.id === sceneId)!;
                    const label = ({ 'new-project': '新建工程', create: '新增戏段', copy: '复制戏段', continue: '接拍戏段', rename: '重命名戏段', reorder: '排序戏段', remove: '删除戏段' } as Record<string, string>)[String(args.action)];
                    if (!sameProjectData(document, next)) recordEdits({ id: uid(), sceneId, sceneName: scene.name, created: Date.now(), label,
                        locations: [{ name: scene.name, action: args.action === 'remove' ? 'removed' : ['new-project', 'create', 'copy', 'continue'].includes(String(args.action)) ? 'added' : 'updated', field: label, start: 0, end: scene.state.duration }] });
                }
                const result = { revision: currentRevision(), sceneContext: ctx.scenes.context, scenes: ctx.scenes.list() };
                receipts.set(args.requestId, { args: encoded, result }); if (receipts.size > 200) receipts.delete(receipts.keys().next().value!); return result;
            } finally { ctx.busy = false; ctx.updateTimeUI(); }
        }
        if (name === 'director_continuity') {
            const revision = currentRevision(), document = ctx.scenes.document();
            const data = await continuitySummary(document, args.sceneId as string | undefined);
            if (!data.origin) return { revision, ...data };
            const offset = Number(args.offset ?? 0), limit = Number(args.limit ?? 50);
            if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 200) throw Error('前情查询分页范围无效');
            const objects = data.origin.objects.filter(o => !args.entityId || o.entityId === args.entityId);
            return { revision, ...data, origin: { ...data.origin, objects: objects.slice(offset, offset + limit), total: objects.length, offset,
                nextOffset: offset + limit < objects.length ? offset + limit : null } };
        }
        if (name === 'director_read') return readScene(ctx, currentRevision(), args as SceneReadOptions);
        if (name === 'director_nodes') {
            const time = args.time === undefined ? ctx.time : Number(args.time); if (!Number.isFinite(time) || time < 0) throw Error('节点查询时间无效');
            const previous = ctx.engine.time;
            try { ctx.engine.sample(time); return { revision: currentRevision(), time, ...ctx.engine.externalModels.nodes(ctx.project, String(args.entityId), args as { path?: string; query?: string; offset?: number; limit?: number }) }; }
            finally { ctx.engine.sample(previous); }
        }
        if (name === 'director_assets') return queryAssetCatalog(args as AssetQuery, ctx.project.creationMode === 'geometry' ? GEOMETRY_ASSET_IDS : undefined);
        if (name === 'director_motions') {
            if (args.source === 'user') {
                const offset = Number(args.offset ?? 0), limit = Number(args.limit ?? 20);
                if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw Error('动作库分页范围无效');
                const list = await listUserMotions(String(args.query ?? ''));
                return { source: 'user', total: list.length, offset, nextOffset: offset + limit < list.length ? offset + limit : null,
                    presets: list.slice(offset, offset + limit).map(m => ({ id: m.id, name: m.name, defaultDuration: m.duration, loop: m.data.loop, ...rigStatus(m.data.rig) })),
                    note: '本机用户动作；使用相同的 motion 操作和返回的 id，源资源自动嵌入工程。未完整映射的动作需先在用户动作库校正。' };
            }
            return { presets: motionPresets(String(args.query ?? '')), note: '内置人形动作，通过 director_apply 的 motion 操作加入人物或群演；duration 可指定持续秒数，省略使用各动作推荐时长，整场坐姿需显式指定全程时长；basicAction 使用手工编排的关节关键姿态，无需附加素材，单次动作加长会放慢表演，循环动作按 speed 控制节奏；pose/poseKeys 可用度数或 XYZ 度数数组调整人形关节；其他动作的素材资源随工程保存，导入人物需完整人形骨架。' };
        }
        if (name === 'director_job') {
            const task = jobs.get(String(args.id)); if (!task) throw new Error('任务不存在'); if (args.cancel) task.aborter.abort();
            const { aborter: _aborter, ...data } = task; return data;
        }
        idle();
        if (name === 'director_path_surface') return { revision: currentRevision(), ...checkPathSurfaces(ctx.project, pathSurfaceModels(ctx.engine), { entityId: String(args.entityId), surfaceId: args.surfaceId as string | undefined, clearance: args.clearance as number | undefined, tolerance: args.tolerance as number | undefined }) };
        if (name === 'director_stride') {
            const entity = ctx.project.entities.find(e => e.id === args.entityId); if (!entity) throw Error('对象不存在');
            return { revision: currentRevision(), ...ctx.engine.externalModels.estimateStride(entity, String(args.clipId)) };
        }
        if (name === 'director_apply') {
            if (typeof args.requestId !== 'string' || !args.requestId || args.requestId.length > 200) throw new Error('需要唯一 requestId');
            const encoded = JSON.stringify(args), receipt = receipts.get(args.requestId);
            if (receipt) { if (receipt.args !== encoded) throw new Error('requestId 已用于不同操作'); return receipt.result; }
            const requests = args.requests as { revision: number; requestId: string; operations: EditOperation[] }[] | undefined;
            if (requests?.some(request => receipts.has(request.requestId))) throw Error('合批包含已提交的 requestId，请分别查询或重试原请求');
            checkRevision(args.revision);
            const savedPreview = typeof args.previewId === 'string' ? previews.get(args.previewId) : undefined;
            if (args.previewId && (!savedPreview || savedPreview.revision !== args.revision)) throw Error('预检已失效，请按当前工程重新预检完整 operations');
            const before = ctx.project;
            ctx.busy = true; ctx.playing = false; ctx.updateTimeUI();
            try {
                const operations = savedPreview?.operations ?? requests?.flatMap(request => request.operations) ?? args.operations as EditOperation[];
                if (!Array.isArray(operations)) throw Error('请提供 operations');
                const userMotions = savedPreview?.userMotions ?? new Map<string, UserMotionAsset>();
                for (const op of operations) if (op?.operation === 'motion' && isUserMotion(op.asset) && !userMotions.has(op.asset!)) userMotions.set(op.asset!, await getUserMotion(op.asset!));
                const after = await applyOperationsWithResources(before, operations, userMotions), summary = changeSummary(before, after);
                if (operations.some(op => op.operation === 'motion')) await ctx.engine.externalModels.prepare(after);
                else if (after.resources?.length) ctx.engine.externalModels.assertReady(after);
                checkRevision(args.revision);
                if (ctx.project !== before || ctx.draft || ctx.history.pending || ctx.engine.exporting) throw Error('REVISION_CONFLICT：准备资源期间工程或编辑状态已变化');
                ctx.busy = false;
                if (!args.preview && !ctx.change(() => { ctx.project = after; })) throw new Error('修改提交失败');
                const previewId = args.preview ? uid() : undefined;
                if (previewId) { previews.set(previewId, { revision: currentRevision(), operations: clone(operations), userMotions }); if (previews.size > 20) previews.delete(previews.keys().next().value!); }
                const changeId = !args.preview && summary.hasChanges ? uid() : undefined;
                if (changeId && ctx.scenes) recordEdits({ id: changeId, sceneId: ctx.scenes.context.sceneId,
                    sceneName: ctx.scenes.list().find(s => s.id === ctx.scenes.context.sceneId)?.name ?? ctx.project.name,
                    created: Date.now(), label: `${operations.length} 项操作`, locations: editLocations(before, after) });
                const result = { revision: currentRevision(), preview: Boolean(args.preview), committed: !args.preview, summary, ...(requests ? { batchRequestIds: requests.map(request => request.requestId) } : {}), ...(previewId ? { previewId } : {}), ...(changeId ? { changeId } : {}),
                    message: args.preview ? '预检通过，尚未写入。使用 previewId 提交。' : '已提交。' };
                if (!args.preview) {
                    for (const request of requests ?? []) receipts.set(request.requestId, { args: JSON.stringify(request), result });
                    receipts.set(args.requestId, { args: encoded, result });
                    while (receipts.size > 200) receipts.delete(receipts.keys().next().value!);
                }
                return result;
            } finally { ctx.busy = false; ctx.engine.externalModels.retain([ctx.project, ...ctx.history.undoStack, ...ctx.history.redoStack]); ctx.updateTimeUI(); }
        }
        if (name === 'director_spatial') {
            if (args.depthRange === true) {
                idle();
                const time = (args.time ?? ctx.time) as number, cameraId = (args.cameraId ?? ctx.preview) as string;
                return { revision: currentRevision(), time, cameraId, depthRange: ctx.engine.suggestDepthRange(time, cameraId, args.ids as string[] | undefined), scope: args.ids ? 'selected-surfaces' : 'frame', applied: false };
            }
            const report = ctx.engine.spatialReport({ time: args.time as number | undefined, cameraId: args.cameraId as string | undefined, occlusionKeys: args.occlusionKeys as string[] | undefined });
            // Filter only the response: walls and other unrequested objects must still occlude.
            if (!Array.isArray(args.ids)) return report;
            const ids = new Set(args.ids);
            return { ...report, objects: report.objects.filter(o => ids.has(o.entityId)), filter: { ids: args.ids, countsScope: 'entire-scene' } };
        }
        if (name === 'director_scan') return job((signal, progress) => scanSpatialRange(ctx.engine, args as unknown as SpatialRangeOptions, signal, (done, total) => progress(done / total)));
        if (name === 'director_view') return controlView(ctx, args);
        if (name === 'director_history') {
            checkRevision(args.revision); if (!['undo', 'redo'].includes(String(args.action))) throw new Error('无效历史操作');
            const before = clone(ctx.project), context = ctx.scenes?.context;
            await ctx.act(String(args.action), document.createElement('button'));
            if (context && !sameProjectData(before, ctx.project)) {
                const sceneId = ctx.scenes.context.sceneId, label = args.action === 'undo' ? '撤销' : '重做';
                recordEdits({ id: uid(), sceneId, sceneName: ctx.scenes.list().find(s => s.id === sceneId)!.name, created: Date.now(), label,
                    locations: sceneId === context.sceneId ? editLocations(before, ctx.project) : [{ name: '戏段', action: 'updated', field: label, start: 0, end: ctx.project.duration }] });
            }
            return { revision: currentRevision() };
        }
        if (name === 'director_export') {
            if (['path','directory','filename','overwrite','scenes','fps','format','monochrome','cameraId','time'].some(k => args[k] !== undefined)) throw Error('这些导出参数需要桌面版');
            const kind = String(args.kind); if (!['project', 'screenshot', 'video', 'depth-video', 'bundle'].includes(kind)) throw new Error('未知导出格式');
            if (kind === 'project') { ctx.saveProject(); return { status: 'save-requested' }; }
            if (kind === 'screenshot') { await ctx.snapshot(); return { status: 'save-requested' }; }
            const project = clone(ctx.project);
            return job(async (signal, progress) => {
                if (kind === 'bundle') { const zip = await createZip(await productionEntries(project, undefined, ctx.scenes?.document()), signal, (a, b) => progress(a / b)); download(zip, safeFilename(project.name) + '-制作素材包.zip'); }
                else { const { exportVideo } = await import('../export.ts'); const [width, height] = outputSize(project.aspect, Number(args.size ?? 1280));
                    const blob = await exportVideo(ctx.engine, { start: Number(args.start ?? 0), end: Number(args.end ?? project.duration), fps: project.fps, width, height, cameraId: 'program', format: 'mp4', monochrome: false, ...(kind === 'depth-video' ? { depth: project.depthVideo ?? DEFAULT_DEPTH_VIDEO } : {}) }, signal, progress);
                    if (blob) download(blob, safeFilename(project.name) + (kind === 'depth-video' ? '-depth' : '') + '.mp4'); }
                return { status: 'save-requested', note: '已生成并发起本地保存；最终保存路径由使用者选择。' };
            });
        }
        throw new Error('工具未实现');
    }
    const service: ToolService = { call(name: string, args: Record<string, unknown> = {}) {
        const pending = sequence.then(async () => { try { return { ok: true, data: await execute(name, args) }; } catch (error) { return { ok: false, error: (error as Error).message, revision: currentRevision() }; } });
        sequence = pending; return pending;
    } };
    services.set(ctx,service); return service;
}
