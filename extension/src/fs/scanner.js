// Walks the opened folder once and builds a tree that contains ONLY supported
// documents. Folders with no documents anywhere below them are dropped, so code,
// build output and other noise never reach the UI.

import { TYPES, typeOf } from './types.js';
import { collator } from '../util.js';

// Folders that never hold docs worth reading and can be huge. Dot-folders
// (.git, .venv, .cache, …) are skipped as well.
const SKIP_DIRS = new Set(['node_modules', '__pycache__', 'venv', 'site-packages', 'bower_components']);
const MAX_DEPTH = 32;
const MAX_PARALLEL_READS = 8;

const emptyCounts = () => Object.fromEntries(Object.keys(TYPES).map((k) => [k, 0]));
const total = (counts) => Object.values(counts).reduce((a, b) => a + b, 0);

function byKindThenName(a, b) {
  if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
  return collator.compare(a.name, b.name);
}

/** Limits how many directories are listed at the same time. */
function limiter(max) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= max || !queue.length) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    fn().then(resolve, reject).finally(() => { active--; next(); });
  };
  return (fn) => new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); next(); });
}

/**
 * @returns {Promise<{root: DirNode, index: Map<string, Node>}>}
 * DirNode  = { kind:'dir',  name, path, children, counts }
 * FileNode = { kind:'file', name, path, handle, type }
 * Paths are '/'-separated and relative to the root ('' is the root itself).
 */
export async function scanFolder(rootHandle, { onProgress } = {}) {
  const limit = limiter(MAX_PARALLEL_READS);
  let dirsRead = 0;

  async function list(dirHandle, path) {
    const files = [];
    const subdirs = [];
    for await (const entry of dirHandle.values()) {
      const name = entry.name;
      if (name.startsWith('.')) continue;
      const childPath = path ? `${path}/${name}` : name;
      if (entry.kind === 'directory') {
        if (!SKIP_DIRS.has(name)) subdirs.push({ handle: entry, path: childPath });
      } else {
        const type = typeOf(name);
        if (type) files.push({ kind: 'file', name, path: childPath, handle: entry, type });
      }
    }
    dirsRead++;
    if (dirsRead % 20 === 0) onProgress?.(dirsRead);
    return { files, subdirs };
  }

  async function walk(dirHandle, path, depth) {
    const node = { kind: 'dir', name: dirHandle.name, path, children: [], counts: emptyCounts() };
    const { files, subdirs } = await limit(() => list(dirHandle, path));
    for (const f of files) {
      node.children.push(f);
      node.counts[f.type]++;
    }
    if (depth < MAX_DEPTH) {
      const kids = await Promise.all(
        subdirs.map((d) => walk(d.handle, d.path, depth + 1).catch(() => null)), // unreadable folder: skip it
      );
      for (const kid of kids) {
        if (!kid || total(kid.counts) === 0) continue;
        node.children.push(kid);
        for (const k in kid.counts) node.counts[k] += kid.counts[k];
      }
    }
    node.children.sort(byKindThenName);
    return node;
  }

  const root = await walk(rootHandle, '', 0);
  const index = new Map();
  (function addToIndex(n) {
    index.set(n.path, n);
    if (n.kind === 'dir') n.children.forEach(addToIndex);
  })(root);
  return { root, index, dirsRead };
}
