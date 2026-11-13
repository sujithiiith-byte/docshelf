// Folder picking and remembering. Directory handles are stored in IndexedDB so
// recent folders can be reopened with one click (Chrome still asks once per
// session for permission, which needs that click).

import { store } from '../util.js';

const DB_NAME = 'docshelf';
const STORE_NAME = 'folders';
const MAX_RECENT = 8;

let dbPromise;
function db() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run(mode, fn) {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, mode);
    const req = fn(tx.objectStore(STORE_NAME));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** Recent folders, newest first: [{ id, name, handle, openedAt }] */
export async function listRecent() {
  const all = (await run('readonly', (s) => s.getAll())) ?? [];
  return all.sort((a, b) => b.openedAt - a.openedAt);
}

/** Adds/refreshes a folder in the recent list and returns its record (stable id per folder). */
export async function remember(handle) {
  const all = await listRecent();
  let existing = null;
  for (const rec of all) {
    try {
      if (await rec.handle.isSameEntry(handle)) { existing = rec; break; }
    } catch { /* stale handle */ }
  }
  const rec = {
    id: existing?.id ?? crypto.randomUUID(),
    name: handle.name,
    handle,
    openedAt: Date.now(),
  };
  await run('readwrite', (s) => s.put(rec));
  const overflow = all.filter((r) => r.id !== rec.id).slice(MAX_RECENT - 1);
  for (const r of overflow) await forget(r.id);
  return rec;
}

export async function forget(id) {
  await run('readwrite', (s) => s.delete(id));
  store.remove(`ws:${id}`);
}

/** Shows the OS folder picker. Returns null if the user cancels. */
export async function pickFolder() {
  try {
    return await window.showDirectoryPicker({ id: 'docshelf', mode: 'read' });
  } catch (err) {
    if (err?.name === 'AbortError') return null;
    throw err;
  }
}

/**
 * Makes sure we may read the folder. With request=false this never prompts
 * (used on startup); with request=true it must run inside a user gesture.
 */
export async function ensureReadPermission(handle, { request }) {
  const opts = { mode: 'read' };
  try {
    if ((await handle.queryPermission(opts)) === 'granted') return true;
    if (!request) return false;
    return (await handle.requestPermission(opts)) === 'granted';
  } catch {
    return false;
  }
}
