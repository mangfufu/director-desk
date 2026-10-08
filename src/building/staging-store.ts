import { assertStagingAsset, stagingMetadata, type StagingAsset, type StagingMetadata } from './staging-asset.ts';
const databaseName = 'director-staging-library-v1';
async function transaction<T>(mode: IDBTransactionMode, work: (tx: IDBTransaction, result: (value: T) => void) => void): Promise<T> {
    if (typeof indexedDB === 'undefined') throw Error('此环境没有本机布景库；离线请使用 .staging 文件');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(databaseName, 1);
        request.onupgradeneeded = () => { request.result.createObjectStore('items', { keyPath: 'id' }); request.result.createObjectStore('metadata', { keyPath: 'id' }); };
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
        return await new Promise<T>((resolve, reject) => {
            const tx = db.transaction(['items', 'metadata'], mode); let value: T;
            tx.oncomplete = () => resolve(value); tx.onabort = tx.onerror = () => reject(tx.error ?? Error('布景库操作失败'));
            try { work(tx, result => value = result); } catch (error) { tx.abort(); reject(error); }
        });
    } finally { db.close(); }
}
export async function listStagingAssets(query = '', offset = 0, limit = 20) {
    if (typeof query !== 'string' || !Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw Error('布景检索参数无效');
    const rows = await transaction<StagingMetadata[]>('readonly', (tx, result) => { tx.objectStore('metadata').getAll().onsuccess = e => result((e.target as IDBRequest).result); });
    const filtered = rows.filter(r => r.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).sort((a, b) => b.updated - a.updated || a.id.localeCompare(b.id));
    return { items: filtered.slice(offset, offset + limit), total: filtered.length, nextOffset: offset + limit < filtered.length ? offset + limit : null };
}
export async function getStagingAsset(id: string) {
    const item = await transaction<StagingAsset | undefined>('readonly', (tx, result) => { tx.objectStore('items').get(id).onsuccess = e => result((e.target as IDBRequest).result); });
    if (!item) throw Error('布景不存在'); assertStagingAsset(item); return item;
}
export async function saveStagingAsset(item: StagingAsset) {
    assertStagingAsset(item);
    await transaction<void>('readwrite', tx => { tx.objectStore('items').put(item); tx.objectStore('metadata').put(stagingMetadata(item)); });
    return stagingMetadata(item);
}
export async function removeStagingAsset(id: string) {
    await transaction<void>('readwrite', tx => { tx.objectStore('items').delete(id); tx.objectStore('metadata').delete(id); });
}
export async function renameStagingAsset(id: string, name: string) {
    return transaction<StagingMetadata>('readwrite', (tx, result) => {
        tx.objectStore('items').get(id).onsuccess = event => {
            const item = (event.target as IDBRequest<StagingAsset | undefined>).result;
            if (!item) { tx.abort(); return; }
            item.name = name; item.scene.name = name; item.updated = Date.now();
            try { assertStagingAsset(item); } catch { tx.abort(); return; }
            const metadata = stagingMetadata(item);
            tx.objectStore('items').put(item); tx.objectStore('metadata').put(metadata); result(metadata);
        };
    });
}
