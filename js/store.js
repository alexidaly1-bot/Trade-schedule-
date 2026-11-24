// Everything is stored on this device only: records in localStorage, images in IndexedDB.

const KEY = 'bm.v1';

export const DEFAULT_SETTINGS = {
  appLock: true,
  discreetAlerts: true,
  hidePrivateDetails: true, // always on for share links; kept as a visible promise
  defaultPrepMinutes: 60,
  healthReminders: false,
  aiAvatarHelp: false,
  profilesLocalOnly: true,
  appTheme: 'Midnight Coral',
  cartoonAvatarStyle: 'Original Cartoon',
  defaultDurationMinutes: 120,
};

const EMPTY = {
  settings: { ...DEFAULT_SETTINGS },
  people: [],
  features: [],
  meetups: [],
  freeTimes: [],
  routines: [],
  readyStatus: [],
  shareLinks: [],
  requests: [],
  album: [], // {id, person, imageId, coveredImageId, fromScreenshot, addedOn}
  avatars: [], // {id, person, svg, style, features, madeBy}
  templates: [],
  screenshots: [], // draft import: {id, imageId, foundText, ...}
  sentReminders: [],
  pinHash: null,
  lastHealthReminder: null,
};

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(EMPTY);
    const s = JSON.parse(raw);
    return { ...structuredClone(EMPTY), ...s, settings: { ...DEFAULT_SETTINGS, ...(s.settings || {}) } };
  } catch {
    return structuredClone(EMPTY);
  }
}

export function get() {
  return state;
}

export function save(mutator) {
  const draft = structuredClone(state);
  const r = mutator(draft);
  state = draft;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    throw new Error('Could not save on this device (storage full?)');
  }
  listeners.forEach((fn) => fn(state));
  return r;
}

export function onChange(fn) {
  listeners.add(fn);
}

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));

export function wipeAll() {
  localStorage.removeItem(KEY);
  state = structuredClone(EMPTY);
  return idb('clear');
}

export function exportJSON() {
  return JSON.stringify({ ...state, pinHash: undefined }, null, 2);
}

// ---------- Images (IndexedDB) ----------
let dbp;
function db() {
  if (!dbp) {
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open('bm-images', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('img');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  return dbp;
}
async function idb(op, key, val) {
  const d = await db();
  return new Promise((res, rej) => {
    const tx = d.transaction('img', op === 'get' ? 'readonly' : 'readwrite');
    const st = tx.objectStore('img');
    const req = op === 'get' ? st.get(key) : op === 'put' ? st.put(val, key) : op === 'delete' ? st.delete(key) : st.clear();
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
export async function putImage(blobOrDataUrl) {
  const id = uid();
  await idb('put', id, blobOrDataUrl);
  return id;
}
export const getImage = (id) => idb('get', id);
export const deleteImage = (id) => idb('delete', id);

const urlCache = new Map();
export async function imageURL(id) {
  if (!id) return '';
  if (urlCache.has(id)) return urlCache.get(id);
  const v = await getImage(id);
  if (!v) return '';
  const url = typeof v === 'string' ? v : URL.createObjectURL(v);
  urlCache.set(id, url);
  return url;
}

// ---------- PIN ----------
export async function hashPin(pin) {
  const data = new TextEncoder().encode('bm-salt:' + pin);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
