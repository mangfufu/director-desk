import { library, requestValue } from '../storage/local-library.ts';
import type { SceneDocument } from '../scenes/sequence-project.ts';
import {packVersion,unpackVersion,validVersionName,type VersionInfo,type StoredVersion} from './snapshot.ts';
export type {VersionInfo} from './snapshot.ts';
const database = 'director-project-versions-v1';
export async function listVersions(projectId: string) {
    const all = await library<VersionInfo[]>(database, 'readonly', (tx, result) => requestValue(tx.objectStore('metadata').getAll(), result));
    return all.filter(v => v.projectId === projectId).sort((a, b) => b.created - a.created || a.id.localeCompare(b.id));
}
export async function saveVersion(document: SceneDocument, name: string) {
    const {item,sources}=await packVersion(document,name),info=item.info;
    await library<void>(database, 'readwrite', tx => {
        for (const [id, value] of sources) {
            const store = tx.objectStore('sources'), request = store.getKey(id);
            request.onsuccess = () => { if (request.result === undefined) store.put(value, id); };
        }
        tx.objectStore('items').put(item, info.id);
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
    return unpackVersion(data.item,data.sources,projectId);
}
export async function editVersion(id: string, projectId: string, name?: string) {
    if (name !== undefined) validVersionName(name);
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
