/** Metadata can be listed without reading large payloads. Transactions resolve only after commit. */
export async function library<T>(name: string, mode: IDBTransactionMode,
    work: (tx: IDBTransaction, result: (value: T) => void) => void): Promise<T> {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name, 1);
        request.onupgradeneeded = () => {
            for (const store of ['items', 'metadata', 'sources']) request.result.createObjectStore(store);
        };
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
        return await new Promise<T>((resolve, reject) => {
            const tx = db.transaction(['items', 'metadata', 'sources'], mode); let value: T;
            tx.oncomplete = () => resolve(value); tx.onerror = tx.onabort = () => reject(tx.error ?? Error('保存失败'));
            try { work(tx, v => value = v); } catch (error) { tx.abort(); reject(error); }
        });
    } finally { db.close(); }
}
export function requestValue<T>(request: IDBRequest<T>, result: (value: T) => void) {
    request.onsuccess = () => result(request.result);
}
