import { library, requestValue } from '../storage/local-library.ts';
import { assertSceneDocument, readSceneDocument, type SceneDocument } from '../scenes/sequence-project.ts';
const database = 'director-project-versions-v1';
export interface VersionInfo { id: string; projectId: string; name: string; created: number; scenes: number; sources: string[] }
interface StoredVersion { info: VersionInfo; document: Omit<SceneDocument, 'resources' | 'media'>; resources: string[]; media: string[] }
function validName(name: string) { if (typeof name !== 'string' || !name.trim() || name.length > 200) throw Error('请输入版本名称（最多 200 字）'); }
export async function listVersions(projectId: string) {
    const all = await library<VersionInfo[]>(database, 'readonly', (tx, result) => requestValue(tx.objectStore('metadata').getAll(), result));
    return all.filter(v => v.projectId === projectId).sort((a, b) => b.created - a.created || a.id.localeCompare(b.id));
}
export async function saveVersion(document: SceneDocument, name: string) {
    validName(name); assertSceneDocument(document);
    if (!document.projectId) throw Error('工程缺少标识');
    const { resources, media = [], ...state } = document;
    const sources = new Map<string, unknown>();
    const hash = async (value: unknown) => {
        const bytes = new TextEncoder().encode(JSON.stringify(value));
        const id = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
        sources.set(id, value); return id;
    };
    // Hash in sequence so large model packages do not all become byte buffers at once.
    const resourceIds: string[] = [], mediaIds: string[] = [];
    for (const item of resources) resourceIds.push(await hash(item));
    for (const item of media) mediaIds.push(await hash(item));
    const info: VersionInfo = { id: crypto.randomUUID(), projectId: document.projectId, name: name.trim(), created: Date.now(), scenes: document.scenes.length, sources: [...sources.keys()] };
    await library<void>(database, 'readwrite', tx => {
        for (const [id, value] of sources) {
            const store = tx.objectStore('sources'), request = store.getKey(id);
            request.onsuccess = () => { if (request.result === undefined) store.put(value, id); };
        }
        tx.objectStore('items').put({ info, document: state, resources: resourceIds, media: mediaIds } satisfies StoredVersion, info.id);
        tx.objectStore('metadata').put(info, info.id);
    });
    return info;
}
export async function loadVersion(id: string, projectId: string): Promise<SceneDocument> {
    const data = await library<{ item?: StoredVersion; sources: Map<string, unknown> }>(database, 'readonly', (tx, result) => {
        const sources = new Map<string, unknown>();
        requestValue<StoredVersion | undefined>(tx.objectStore('items').get(id), item => {
            result({ item, sources });
            if (item) for (const key of item.info.sources) requestValue(tx.objectStore('sources').get(key), value => sources.set(key, value));
        });
    });
    if (!data.item || data.item.info.projectId !== projectId) throw Error('版本不存在或不属于当前工程');
    const { item, sources } = data;
    return readSceneDocument({ ...item.document, resources: item.resources.map(id => sources.get(id)), ...(item.media.length ? { media: item.media.map(id => sources.get(id)) } : {}) });
}
export async function editVersion(id: string, projectId: string, name?: string) {
    if (name !== undefined) validName(name);
    return library<void>(database, 'readwrite', tx => {
        requestValue<StoredVersion | undefined>(tx.objectStore('items').get(id), item => {
            if (!item || item.info.projectId !== projectId) { tx.abort(); return; }
            if (name !== undefined) {
                item.info.name = name.trim(); tx.objectStore('items').put(item, id); tx.objectStore('metadata').put(item.info, id);
            } else {
                tx.objectStore('items').delete(id); tx.objectStore('metadata').delete(id);
                requestValue<VersionInfo[]>(tx.objectStore('metadata').getAll(), rows => {
                    const used = new Set(rows.flatMap(r => r.sources));
                    for (const key of item.info.sources) if (!used.has(key)) tx.objectStore('sources').delete(key);
                });
            }
        });
    });
}
