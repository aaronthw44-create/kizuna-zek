/**
 * Offline-First Storage using browser IndexedDB for Lore files and Session Media.
 * Zero network requests when browsing, reading, or opening gallery offline.
 */

const DB_NAME = 'kizuna_zek_db';
const DB_VERSION = 2;

export type IDBStoreName = 'lore_files' | 'media_files' | 'chats';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported in this environment'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('lore_files')) {
        db.createObjectStore('lore_files', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('media_files')) {
        db.createObjectStore('media_files', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('chats')) {
        db.createObjectStore('chats', { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function idbSaveItem<T>(storeName: IDBStoreName, item: T): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.put(item);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn(`IndexedDB save error in ${storeName}:`, err);
  }
}

export async function idbSaveAll<T extends Record<string, any>>(storeName: IDBStoreName, items: T[]): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);

      const getAllReq = store.getAll();
      getAllReq.onsuccess = () => {
        const existingRecords: T[] = getAllReq.result || [];
        const existingMap = new Map<string, any>();
        for (const rec of existingRecords) {
          if (rec && rec.id) existingMap.set(rec.id, rec);
        }

        store.clear();

        for (const rawItem of items) {
          if (!rawItem || !rawItem.id) continue;
          let itemToSave: any = rawItem;
          const prev = existingMap.get(rawItem.id);

          if (storeName === 'media_files') {
            if (!itemToSave.dataUrl && prev?.dataUrl) {
              itemToSave = { ...itemToSave, dataUrl: prev.dataUrl };
            }
            if (!itemToSave.videoUrl && prev?.videoUrl) {
              itemToSave = { ...itemToSave, videoUrl: prev.videoUrl };
            }
            if (!itemToSave.dataUrl && !itemToSave.videoUrl) continue;
          } else if (storeName === 'lore_files' && prev) {
            if (!itemToSave.dataUrl && prev.dataUrl) {
              itemToSave = { ...itemToSave, dataUrl: prev.dataUrl };
            }
            if (!itemToSave.content && prev.content) {
              itemToSave = { ...itemToSave, content: prev.content };
            }
          } else if (storeName === 'chats' && prev && Array.isArray(itemToSave.messages) && Array.isArray(prev.messages)) {
            const prevMsgMap = new Map<string, any>();
            for (const pm of prev.messages) {
              if (pm && pm.id) prevMsgMap.set(pm.id, pm);
            }
            itemToSave = {
              ...itemToSave,
              messages: itemToSave.messages.map((m: any) => {
                const oldMsg = prevMsgMap.get(m.id);
                if (!oldMsg) return m;
                let restoredAttachments = m.attachments;
                if (Array.isArray(m.attachments) && Array.isArray(oldMsg.attachments)) {
                  restoredAttachments = m.attachments.map((att: any, idx: number) => {
                    const oldAtt = oldMsg.attachments.find((oa: any) => oa.id === att.id || oa.name === att.name) || oldMsg.attachments[idx];
                    if (!att.dataUrl && oldAtt?.dataUrl) {
                      return { ...att, dataUrl: oldAtt.dataUrl };
                    }
                    return att;
                  });
                }
                let restoredGenState = m.generationState;
                if (m.generationState && oldMsg.generationState && !m.generationState.resultUrl && oldMsg.generationState.resultUrl) {
                  restoredGenState = { ...m.generationState, resultUrl: oldMsg.generationState.resultUrl };
                }
                return {
                  ...m,
                  attachments: restoredAttachments,
                  generationState: restoredGenState,
                };
              }),
            };
          }

          store.put(itemToSave);
        }
      };
    });
  } catch (err) {
    console.warn(`IndexedDB bulk save error in ${storeName}:`, err);
  }
}

export async function idbGetAll<T>(storeName: IDBStoreName): Promise<T[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn(`IndexedDB read error in ${storeName}:`, err);
    return [];
  }
}

export async function idbDeleteItem(storeName: IDBStoreName, id: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.delete(id);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn(`IndexedDB delete error in ${storeName}:`, err);
  }
}
