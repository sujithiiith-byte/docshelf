// Full-text search over Markdown and text files (PDF text isn't extracted).
// Files are read on demand, a few at a time, and kept in a small cache keyed by
// modification time, so repeated searches are instant and stay current.

const SEARCHABLE = new Set(['md', 'txt']);
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_CACHE_BYTES = 48 * 1024 * 1024;
const MAX_MATCHES_PER_FILE = 50;
const MAX_TOTAL_MATCHES = 2000;
const PARALLEL = 6;

export class SearchEngine {
  #cache = new Map(); // path -> { mtime, size, text }
  #cacheBytes = 0;

  clear() {
    this.#cache.clear();
    this.#cacheBytes = 0;
  }

  async #read(node) {
    const file = await node.handle.getFile();
    if (file.size > MAX_FILE_BYTES) return null;
    const hit = this.#cache.get(node.path);
    if (hit && hit.mtime === file.lastModified && hit.size === file.size) return hit.text;
    const text = await file.text();
    if (hit) this.#cacheBytes -= hit.text.length;
    if (this.#cacheBytes + text.length > MAX_CACHE_BYTES) this.clear();
    this.#cache.set(node.path, { mtime: file.lastModified, size: file.size, text });
    this.#cacheBytes += text.length;
    return text;
  }

  /**
   * Calls onFile({ node, matches, truncated }) for each file with matches.
   * A match is { line, preview, start, end, occurrence } where start/end mark
   * the hit inside `preview` and occurrence is its index within the file.
   * Resolves to { files, matches, limited } unless cancelled via isCancelled().
   */
  async search(nodes, query, { onFile, isCancelled }) {
    const q = query.toLowerCase();
    const files = nodes.filter((n) => n.kind === 'file' && SEARCHABLE.has(n.type));
    let totalMatches = 0;
    let fileCount = 0;
    let anyTruncated = false;
    let next = 0;

    const worker = async () => {
      while (next < files.length) {
        if (isCancelled() || totalMatches >= MAX_TOTAL_MATCHES) return;
        const node = files[next++];
        let text;
        try { text = await this.#read(node); } catch { continue; }
        if (text == null || isCancelled()) continue;
        const found = findInText(text, q, MAX_MATCHES_PER_FILE);
        if (!found.matches.length) continue;
        totalMatches += found.matches.length;
        if (found.truncated) anyTruncated = true;
        fileCount++;
        onFile({ node, ...found });
      }
    };
    await Promise.all(Array.from({ length: PARALLEL }, worker));
    return { files: fileCount, matches: totalMatches, limited: anyTruncated || totalMatches >= MAX_TOTAL_MATCHES };
  }
}

function findInText(text, q, limit) {
  const lower = text.toLowerCase();
  const matches = [];
  let line = 1;
  let lineStart = 0;
  let scanned = 0;
  let occurrence = 0;
  let idx = lower.indexOf(q);
  while (idx >= 0) {
    if (matches.length >= limit) return { matches, truncated: true };
    for (let i = scanned; i < idx; i++) {
      if (text.charCodeAt(i) === 10) { line++; lineStart = i + 1; }
    }
    scanned = idx;
    let lineEnd = text.indexOf('\n', idx);
    if (lineEnd < 0) lineEnd = text.length;
    // Show a window of the line around the hit.
    const from = Math.max(lineStart, idx - 14); // keep the hit visible in a narrow sidebar
    const to = Math.min(lineEnd, idx + q.length + 80);
    const raw = text.slice(from, to);
    const trimmed = raw.replace(/^\s+/, '');
    const cut = raw.length - trimmed.length;
    matches.push({
      line,
      preview: (from > lineStart ? '…' : '') + trimmed,
      start: idx - from - cut + (from > lineStart ? 1 : 0),
      end: idx - from - cut + (from > lineStart ? 1 : 0) + q.length,
      occurrence: occurrence++,
    });
    idx = lower.indexOf(q, idx + q.length);
  }
  return { matches, truncated: false };
}
