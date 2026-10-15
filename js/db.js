// Local storage for the library. Everything stays in this browser (IndexedDB).
const DB_NAME = "skin-library";
const STORE = "skins";
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx(mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    const out = fn(store);
    t.oncomplete = () => resolve(out && "result" in out ? out.result : out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export const db = {
  all: () => tx("readonly", s => s.getAll()),
  put: skin => tx("readwrite", s => s.put(skin)),
  putMany: skins => tx("readwrite", s => { skins.forEach(k => s.put(k)); }),
  remove: id => tx("readwrite", s => s.delete(id)),
  clear: () => tx("readwrite", s => s.clear()),
};

export function newId() {
  return (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
}

/** Ask the browser to keep the data even when space runs low. Harmless if refused. */
export async function askPersist() {
  try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) { /* ignore */ }
}
