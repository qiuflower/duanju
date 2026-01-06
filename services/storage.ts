
const DB_NAME = 'NanobananaStoryboarderDB';
const STORE_NAME = 'AppState';
const DB_VERSION = 1;

export const saveState = async (key: string, value: any) => {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      try {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        store.put(value, key);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      } catch (e) {
          reject(e);
      }
    };

    request.onerror = () => reject(request.error);
  });
};

export const loadState = async (key: string) => {
  return new Promise<any>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
        }
    };

    request.onsuccess = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      try {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const query = store.get(key);
        query.onsuccess = () => resolve(query.result);
        query.onerror = () => reject(query.error);
      } catch (e) {
        reject(e);
      }
    };

    request.onerror = () => reject(request.error);
  });
};

export const clearState = async (key: string) => {
    return new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onsuccess = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            try {
                const transaction = db.transaction(STORE_NAME, 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                store.delete(key);
                transaction.oncomplete = () => resolve();
                transaction.onerror = () => reject(transaction.error);
            } catch (e) {
                reject(e);
            }
        };
        request.onerror = () => reject(request.error);
    });
};
