import type { ProcessedDocument } from './types';
const DB = 'putusan-ir-pipeline', STORE = 'corpora';
async function open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}
export async function loadCache(key: string): Promise<ProcessedDocument[] | undefined> {
    const db = await open();
    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readonly'), store = tx.objectStore(STORE);
            const manifest = store.get(key);
            let docs: ProcessedDocument[] | undefined;
            manifest.onsuccess = () => {
                const count = manifest.result?.count;
                if (!Number.isInteger(count) || count <= 0) return;
                docs = new Array(count);
                for (let i = 0; i < count; i++) {
                    const request = store.get([key, i]);
                    request.onsuccess = () => { docs![i] = request.result; };
                }
            };
            tx.oncomplete = () => resolve(docs && Array.from(docs).every(Boolean) ? docs : undefined);
            tx.onerror = tx.onabort = () => reject(tx.error);
        });
    } finally { db.close(); }
}
export async function saveCache(key: string, docs: ProcessedDocument[]): Promise<void> {
    const db = await open();
    try {
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite'), store = tx.objectStore(STORE);
            tx.oncomplete = () => resolve();
            tx.onerror = tx.onabort = () => reject(tx.error);
            // One value for the entire corpus exceeds Chromium's per-value limit.
            // A single transaction publishes the manifest and all documents atomically.
            try {
                docs.forEach((doc, i) => store.put(doc, [key, i]));
                store.put({ count: docs.length }, key);
            } catch (error) { tx.abort(); reject(error); }
        });
    } finally { db.close(); }
}
export async function clearCache(): Promise<void> {
    const db = await open();
    try {
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).clear();
            tx.oncomplete = () => resolve();
            tx.onerror = tx.onabort = () => reject(tx.error);
        });
    } finally { db.close(); }
}
