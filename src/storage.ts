import { clone, type Project } from './model.ts';
import { readSceneDocument, type SceneDocument } from './scenes/sequence-project.ts';
import type { SceneView } from './scenes/sequence-session.ts';
export interface ResourceOwner { resources?: readonly { id: string }[] }
export interface EditorHistory {
    readonly undoStack: readonly ResourceOwner[];
    readonly redoStack: readonly ResourceOwner[];
    readonly pending: Project | null;
    readonly restoredSelection: string | undefined;
    readonly restoredView?: SceneView;
    begin(project: Project): void;
    commit(project: Project): void;
    rollback(): Project | null;
    undo(project: Project): Project | null;
    redo(project: Project): Project | null;
}
const DB_NAME = 'director-desk-v1';
async function database() { return await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open(DB_NAME, 1); r.onupgradeneeded = () => r.result.createObjectStore('projects'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); }
export interface RecoveryFileState { path: string; dirty: boolean }
export async function autosave(project: Project | SceneDocument | (() => SceneDocument | null), fileState?: () => RecoveryFileState) {
    // A provider creates one owned snapshot only after the database is ready. Returning null
    // defers capture while the editor is dragging, without cloning or storing a partial gesture.
    const snapshot = typeof project === 'function' ? undefined : clone(project);
    const db = await database(); try {
    const data = typeof project === 'function' ? project() : snapshot;
    if (!data) return false;
    const state = fileState?.();
    await new Promise<void>((resolve, reject) => { const tx = db.transaction('projects', 'readwrite'); const store = tx.objectStore('projects'); store.put(data, 'recovery'); if (state) store.put(state, 'recovery-file'); else store.delete('recovery-file'); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
    return true;
}
finally {
    db.close();
} }
export async function recoverSession(): Promise<{ document: SceneDocument; file: RecoveryFileState } | null> { const db = await database(); try {
    const store = db.transaction('projects').objectStore('projects');
    const read = (key: string) => new Promise<any>((resolve, reject) => { const r = store.get(key); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const [data, file] = await Promise.all([read('recovery'), read('recovery-file')]);
    return data ? { document: readSceneDocument(data), file: { path: typeof file?.path === 'string' ? file.path : '', dirty: file?.dirty !== false } } : null;
}
finally {
    db.close();
} }
export async function recover(): Promise<SceneDocument | null> { return (await recoverSession())?.document ?? null; }
export function download(blob: Blob, name: string) { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000); }
