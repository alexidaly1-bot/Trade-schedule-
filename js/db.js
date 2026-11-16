// Everything is stored on this device only, in IndexedDB. Nothing is uploaded.
const DB_NAME = 'trade-schedule';
let dbp;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('trades', { keyPath: 'id' });
      db.createObjectStore('appts', { keyPath: 'id' });
      db.createObjectStore('images', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  return dbp;
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const r = fn(s);
    t.oncomplete = () => resolve(r && 'result' in r ? r.result : undefined);
    t.onerror = () => reject(t.error);
  });
}

export const db = {
  all: (store) => tx(store, 'readonly', s => s.getAll()),
  get: (store, id) => tx(store, 'readonly', s => s.get(id)),
  put: (store, obj) => tx(store, 'readwrite', s => s.put(obj)),
  del: (store, id) => tx(store, 'readwrite', s => s.delete(id)),
  clear: (store) => tx(store, 'readwrite', s => s.clear()),
};

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// Backup: everything (images as data URLs) in one JSON file.
export async function exportAll() {
  const [trades, appts, images] = await Promise.all([db.all('trades'), db.all('appts'), db.all('images')]);
  const imgs = await Promise.all(images.map(async i => ({ ...i, blob: undefined, data: await blobToDataURL(i.blob) })));
  return JSON.stringify({ version: 1, exported: new Date().toISOString(), trades, appts, images: imgs });
}

export async function importAll(json) {
  const data = JSON.parse(json);
  for (const t of data.trades || []) await db.put('trades', t);
  for (const a of data.appts || []) await db.put('appts', a);
  for (const i of data.images || []) {
    const blob = await (await fetch(i.data)).blob();
    await db.put('images', { id: i.id, tradeId: i.tradeId, kind: i.kind, blob });
  }
}

function blobToDataURL(blob) {
  return new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
}
