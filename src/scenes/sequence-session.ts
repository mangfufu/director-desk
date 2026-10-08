import { readIndependentScene, type SavedSceneReadOptions } from './scene-query.ts';
import { clone, type Project } from '../model.ts';
import { sameModelResources } from '../resources/package-validation.ts';
import { readSceneDocument, updateValidatedDocumentScene, type SceneDocument } from './sequence-project.ts';

export interface SceneContext { sessionId: string; sceneId: string; revision: number }
export interface SceneView { time: number; preview: string; selected: string }
export interface SceneTransaction extends SceneContext { readonly project: Project }
export interface SceneHistoryLabel { label: string; sceneId: string; sceneName: string }
interface DocumentFile { path: string; saved: SceneDocument | null }
interface Snapshot { document: SceneDocument; views: Record<string, SceneView>; file: DocumentFile }
interface HistoryEntry extends Snapshot { action: SceneHistoryLabel; revealSceneId?: string }

/** One production document, one chronological history. No renderer, DOM or persistence side effects. */
export class SceneSession {
    #document: SceneDocument;
    #file: DocumentFile;
    #dirtyCache?: { current: SceneDocument; saved: SceneDocument; value: boolean };
    #sessionId = crypto.randomUUID();
    #revision = 0;
    #views: Record<string, SceneView> = {};
    #undo: HistoryEntry[] = [];
    #redo: HistoryEntry[] = [];
    #pending: { token: SceneTransaction; before: Snapshot } | null = null;
    constructor(input: unknown) { this.#document = readSceneDocument(input); this.#document.projectId ??= crypto.randomUUID(); this.#file = { path: '', saved: this.#document }; }
    get projectId() { return this.#document.projectId!; }
    get filePath() { return this.#file.path; }
    get dirty() {
        const saved = this.#file.saved, current = this.#document;
        if (!saved) return true;
        if (this.#dirtyCache?.current === current && this.#dirtyCache.saved === saved) return this.#dirtyCache.value;
        // View changes do not dirty content. Owned snapshots make undo-to-save cheap,
        // and source packages are compared without serializing embedded binary data.
        const value = current !== saved && (current.name !== saved.name || !sameModelResources(current.resources, saved.resources)
            || current.media !== saved.media && JSON.stringify(current.media?.map(({data:_data,...r})=>r)) !== JSON.stringify(saved.media?.map(({data:_data,...r})=>r))
            || current.scenes.length !== saved.scenes.length
            || current.scenes.some((scene, i) => scene !== saved.scenes[i] && JSON.stringify(scene) !== JSON.stringify(saved.scenes[i])));
        this.#dirtyCache = { current, saved, value };
        return value;
    }
    markSaved(path = this.#file.path) { this.#file.path = path; this.#file.saved = this.#document; }
    /** File identity is local history metadata; never serialized into a shared project. */
    setFile(path = '', saved = false) { this.#file = { path, saved: saved ? this.#document : null }; }
    get context(): SceneContext { return { sessionId: this.#sessionId, sceneId: this.#document.activeSceneId, revision: this.#revision }; }
    get pending() { return !!this.#pending; }
    get undoLabel(): SceneHistoryLabel | null { return clone(this.#undo.at(-1)?.action ?? null); }
    get redoLabel(): SceneHistoryLabel | null { return clone(this.#redo.at(-1)?.action ?? null); }
    get undoCount() { return this.#undo.length; }
    get redoCount() { return this.#redo.length; }
    sceneList() { return this.#document.scenes.map(({ id, name, state, origin }) => ({ id, name, duration: state.duration, fps: state.fps, aspect: state.aspect, entityCount: state.entities.length, hasOrigin: !!origin })); }
    readScene(id?: string, options?: SavedSceneReadOptions) { return readIndependentScene(this.#document, id, options); }
    exportDocument(): SceneDocument { return clone(this.#document); }
    project(id = this.#document.activeSceneId): Project {
        // The session owns already-validated snapshots. Only the requested scene escapes, as a copy.
        this.#sceneExists(id);
        return clone({ format: 'director-desk', version: 2, name: this.#document.name, resources: this.#document.resources, ...(this.#document.media?.length?{media:this.#document.media}:{}),
            ...this.#document.scenes.find(scene => scene.id === id)!.state });
    }
    view(id = this.#document.activeSceneId): SceneView {
        this.#sceneExists(id);
        const scene = this.#document.scenes.find(scene => scene.id === id)!;
        return clone(this.#views[id] ?? { time: 0, preview: 'program', selected: scene.state.entities.find(e => e.kind === 'actor')?.id ?? scene.state.entities[0].id });
    }
    setView(view: SceneView, id = this.#document.activeSceneId) {
        this.#sceneExists(id);
        const scene = this.#document.scenes.find(scene => scene.id === id)!;
        if (!view || !Number.isFinite(view.time) || view.time < 0 || typeof view.selected !== 'string'
            || (view.selected && !scene.state.entities.some(e => e.id === view.selected))
            || view.preview !== 'program' && !scene.state.entities.some(e => e.id === view.preview && e.kind === 'camera')) throw Error('戏段预览状态无效');
        this.#views[id] = clone(view);
    }
    #sceneExists(id: string) { if (!this.#document.scenes.some(scene => scene.id === id)) throw Error('戏段不存在'); }
    #idle() { if (this.#pending) throw Error('请先完成或取消当前戏段编辑'); }
    #check(context: SceneContext) {
        if (!context || context.sessionId !== this.#sessionId || context.revision !== this.#revision) throw Error('REVISION_CONFLICT：工程已变化，请重新读取戏段上下文');
        this.#sceneExists(context.sceneId);
    }
    #snapshot(): Snapshot { return { document: this.#document, views: clone(this.#views), file: this.#file }; }
    #label(label: string, sceneId: string): SceneHistoryLabel {
        if (typeof label !== 'string' || !label.trim() || label.length > 200) throw Error('操作说明无效');
        return { label, sceneId, sceneName: this.#document.scenes.find(scene => scene.id === sceneId)?.name ?? sceneId };
    }
    #publish(next: SceneDocument, before: Snapshot, action: SceneHistoryLabel, revealSceneId?: string, force = false) {
        // Callers validate new data before publishing; unchanged owned scenes need no revalidation.
        const old = before.document;
        if (!force && next.projectId === old.projectId && next.activeSceneId === old.activeSceneId && next.name === old.name
            && (next.media===old.media||JSON.stringify(next.media?.map(({data:_data,...r})=>r))===JSON.stringify(old.media?.map(({data:_data,...r})=>r)))
            && sameModelResources(next.resources, old.resources)
            && next.scenes.length === old.scenes.length && next.scenes.every((scene, i) => scene === old.scenes[i] || JSON.stringify(scene) === JSON.stringify(old.scenes[i]))) return;
        this.#undo.push({ ...before, action, revealSceneId }); if (this.#undo.length > 35) this.#undo.shift(); this.#redo = [];
        this.#document = next; this.#revision++;
        this.#repairViews();
    }
    #repairViews() {
        for (const id of Object.keys(this.#views)) {
            const scene = this.#document.scenes.find(scene => scene.id === id);
            if (!scene) { delete this.#views[id]; continue; }
            const view = this.#views[id];
            if (view.selected && !scene.state.entities.some(e => e.id === view.selected)) view.selected = scene.state.entities[0].id;
            if (view.preview !== 'program' && !scene.state.entities.some(e => e.id === view.preview && e.kind === 'camera')) view.preview = 'program';
        }
    }
    begin(context: SceneContext = this.context, source?: Project): SceneTransaction {
        this.#idle(); this.#check(context);
        // The editor can supply its working state; one isolated copy also serves its rollback.
        const token = Object.freeze({ ...context, project: source ? clone(source) : this.project(context.sceneId) });
        this.#pending = { token, before: this.#snapshot() }; return token;
    }
    #transaction(token: SceneTransaction) {
        if (!this.#pending || this.#pending.token !== token) throw Error('戏段编辑事务已结束或不属于当前会话');
        this.#check(token); return this.#pending;
    }
    commit(token: SceneTransaction, project = token.project, label = '编辑戏段') {
        const pending = this.#transaction(token), action = this.#label(label, token.sceneId);
        // On failure the transaction stays pending, allowing an explicit rollback or corrected retry.
        const next = updateValidatedDocumentScene(this.#document, token.sceneId, project);
        this.#publish(next, pending.before, action, token.sceneId); this.#pending = null;
    }
    switchScene(id: string, context: SceneContext = this.context) {
        this.#idle(); this.#check(context); this.#sceneExists(id);
        this.#publish({ ...this.#document, activeSceneId: id }, this.#snapshot(), this.#label('切换戏段', context.sceneId));
    }
    rollback(token: SceneTransaction) {
        const pending = this.#transaction(token); this.#views = clone(pending.before.views); this.#pending = null;
        return this.project();
    }
    /** Caller may validate/prepare a proposed document before commit. Context must still match afterward. */
    replace(next: SceneDocument, context: SceneContext, label: string, resetViews = false) {
        this.#idle(); this.#check(context); const owned = readSceneDocument(next);
        owned.projectId ??= crypto.randomUUID();
        this.#publish(owned, this.#snapshot(), this.#label(label, context.sceneId), undefined, resetViews);
        if (resetViews) this.#views = {};
    }
    editDocument(context: SceneContext, label: string, operation: (document: SceneDocument) => SceneDocument) {
        this.#idle(); this.#check(context);
        const next = operation(this.exportDocument());
        this.replace(next, context, label);
    }
    #restore(from: HistoryEntry[], to: HistoryEntry[]): SceneHistoryLabel | null {
        this.#idle(); const entry = from.at(-1); if (!entry) return null;
        from.pop(); to.push({ ...this.#snapshot(), action: entry.action, revealSceneId: entry.revealSceneId });
        this.#document = entry.revealSceneId && entry.document.scenes.some(scene => scene.id === entry.revealSceneId)
            ? { ...entry.document, activeSceneId: entry.revealSceneId } : entry.document;
        this.#views = clone(entry.views); this.#revision++; this.#repairViews();
        this.#file = entry.file;
        return clone(entry.action);
    }
    undo(context: SceneContext = this.context) { this.#check(context); return this.#restore(this.#undo, this.#redo); }
    redo(context: SceneContext = this.context) { this.#check(context); return this.#restore(this.#redo, this.#undo); }
    /** Include sources owned only by inactive scenes, pending operations or either history direction. */
    retainedResourceIds(): string[] {
        const documents = [this.#document, ...this.#undo.map(entry => entry.document), ...this.#redo.map(entry => entry.document), ...(this.#pending ? [this.#pending.before.document] : [])];
        return [...new Set([...documents.flatMap(document => document.resources.map(resource => resource.id)),
            ...(this.#pending?.token.project.resources ?? []).map(resource => resource.id)])];
    }
    resourceScenes(id: string) {
        return this.#document.scenes.filter(scene => [...scene.state.entities, ...(scene.origin?.state.entities ?? [])].some(e => e.external?.resourceId === id || e.clips.some(c => c.retarget?.resourceId === id)))
            .map(scene => ({ id: scene.id, name: scene.name }));
    }
}
