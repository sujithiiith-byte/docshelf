// Builds a realistic sample folder and stages the UI for README
// screenshots (1280x800). Used by: python3 tools/e2e/run.py --store
(() => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  async function waitFor(fn, ms = 4000) {
    const end = Date.now() + ms;
    while (Date.now() < end) { try { const v = fn(); if (v) return v; } catch { /* retry */ } await sleep(30); }
    return null;
  }
  const view = () => $('.view:not([hidden])');

  function makePdf(titles) {
    const objs = [];
    const add = (s) => { objs.push(s); return objs.length; };
    const catalog = add(null);
    const pages = add(null);
    const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
    const bold = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
    const kids = titles.map((t, i) => {
      const body = ['The system shall load documents from a local folder only.', 'No document content leaves the device.', 'Opening a document takes under 200 ms for files below 1 MB.', 'All views support light and dark themes.']
        .map((line, j) => `BT /F1 13 Tf 72 ${640 - j * 26} Td (${i + 1}.${j + 1}  ${line}) Tj ET`).join('\n');
      const text = `BT /F2 26 Tf 72 700 Td (${t}) Tj ET\n${body}`;
      const content = add(`<< /Length ${text.length} >>\nstream\n${text}\nendstream`);
      return add(`<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 612 792] /Contents ${content} 0 R /Resources << /Font << /F1 ${font} 0 R /F2 ${bold} 0 R >> >> >>`);
    });
    objs[catalog - 1] = `<< /Type /Catalog /Pages ${pages} 0 R >>`;
    objs[pages - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
    let out = '%PDF-1.4\n';
    const offsets = [];
    objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
    out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return out;
  }

  const DIAGRAM = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="150" font-family="system-ui, sans-serif" font-size="15">
  <defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#5f6873"/></marker></defs>
  <g stroke="#2f6fde" stroke-width="1.5" fill="#eaf1fd">
    <rect x="10" y="45" width="150" height="60" rx="10"/><rect x="245" y="45" width="150" height="60" rx="10"/><rect x="480" y="45" width="150" height="60" rx="10"/>
  </g>
  <g fill="#1f2328" text-anchor="middle"><text x="85" y="80">Web client</text><text x="320" y="80">API gateway</text><text x="555" y="80">Doc service</text></g>
  <g stroke="#5f6873" stroke-width="1.5" marker-end="url(#a)"><line x1="160" y1="75" x2="243" y2="75"/><line x1="395" y1="75" x2="478" y2="75"/></g>
  <g fill="#5f6873" font-size="12" text-anchor="middle"><text x="202" y="65">HTTPS</text><text x="437" y="65">gRPC</text></g>
</svg>`;

  const OVERVIEW = `# Architecture overview

This document describes how **Acme Docs** serves design documents to the web client, and the trade-offs behind the current design. See [ADR-001](decisions/ADR-001-storage.md) for the storage decision.

![System diagram](../assets/system.svg)

## Components

| Component | Responsibility | Owner |
| --- | --- | --- |
| Web client | Renders documents, offline cache | Frontend |
| API gateway | Auth, rate limiting, routing | Platform |
| Doc service | Storage, versioning, search index | Docs team |

## Request flow

1. The client requests \`/v1/docs/{id}\` with a session token.
2. The gateway validates the token and forwards the call.
3. The doc service returns the latest version from the cache when possible.

\`\`\`ts
export async function getDoc(id: string): Promise<Doc> {
  const cached = await cache.get(id);
  if (cached) return cached;
  const doc = await store.load(id);
  await cache.set(id, doc, { ttl: 300 });
  return doc;
}
\`\`\`

## Caching

- [x] Per-document cache with a 5 minute TTL
- [x] Invalidation on publish
- [ ] Warm cache for the 100 most-read docs

> Cache misses are rare after warm-up; see the dashboard notes in \`notes/\`.

## Open questions

Should search results be cached separately from documents?
`;

  const ADR = `---
status: accepted
date: 2026-10-02
---
# ADR-001: Store documents as Markdown files

## Context

Design documents are written by engineers in their editors and reviewed in pull requests. A database-backed editor would add friction and lock content into one tool.

## Decision

Keep every document as a plain **Markdown file in the repository**, next to the code it describes. Rendering happens in the client.

## Consequences

- Documents are diffable and reviewable like code.
- Any editor works; no new tool to learn.
- Search needs a lightweight local index instead of a database query.

\`\`\`yaml
docs:
  root: ./docs
  formats: [md, pdf, txt]
  cache: { ttl: 300 }
\`\`\`
`;

  const FILES = {
    'README.md': '# Acme design docs\n\nStart with the [architecture overview](architecture/overview.md).\n',
    'architecture/overview.md': OVERVIEW,
    'architecture/decisions/ADR-001-storage.md': ADR,
    'architecture/decisions/ADR-002-search-index.md': '# ADR-002: Local search index\n\nStatus: proposed. The cache layer keeps a small inverted index.\n',
    'api/endpoints.md': '# API endpoints\n\n| Method | Path | Notes |\n| --- | --- | --- |\n| GET | /v1/docs/{id} | Served from cache when warm |\n| POST | /v1/docs | Invalidates the cache entry |\n',
    'api/auth.md': '# Authentication\n\nSession tokens are validated at the gateway before any cache lookup.\n',
    'assets/system.svg': DIAGRAM,
    'notes/2026-11-02-sync.txt': 'Weekly sync, 2 Nov\n\n- Cache hit rate is 94% after the warm-up change.\n- Next: decide on the search index (ADR-002).\n',
    'specs/requirements.pdf': makePdf(['Requirements', 'Performance', 'Security']),
    'src/server.py': 'print("hidden from DocShelf")\n',
    'src/cache.go': 'package cache\n',
  };

  window.__store = {
    async setup() {
      const opfs = await navigator.storage.getDirectory();
      for await (const name of opfs.keys()) await opfs.removeEntry(name, { recursive: true });
      const root = await opfs.getDirectoryHandle('acme-design-docs', { create: true });
      for (const [path, content] of Object.entries(FILES)) {
        const parts = path.split('/');
        let d = root;
        for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p, { create: true });
        const w = await (await d.getFileHandle(parts.at(-1), { create: true })).createWritable();
        await w.write(content);
        await w.close();
      }
      localStorage.clear();
      await window.docshelf.openRoot(root, { request: false });
      await waitFor(() => $('.row'));
      const ws = window.docshelf;
      ws.explorer.reveal('architecture/decisions/ADR-001-storage.md');
      ws.explorer.reveal('api/endpoints.md');
      for (const p of ['architecture/decisions/ADR-001-storage.md', 'api/endpoints.md', 'notes/2026-11-02-sync.txt']) ws.tabs.open(p, { pin: true });
      ws.tabs.open('architecture/overview.md');
      await waitFor(() => view()?.querySelector('img[src^="blob:"]'));
      await sleep(400);
      return true;
    },
    async search() {
      window.docshelf.setSidebarMode('search');
      const input = $('.search-panel input');
      input.value = 'cache';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await waitFor(() => $('.hit mark'));
      await sleep(200);
      $$('.hit')[5].click();
      await sleep(500);
      return true;
    },
    async dark() {
      window.docshelf.setSidebarMode('files');
      document.documentElement.dataset.theme = 'dark';
      const tab = $$('.tab').find((t) => t.textContent.includes('ADR-001'));
      tab.click();
      await sleep(400);
      return true;
    },
    async quickOpen() {
      delete document.documentElement.dataset.theme;
      $$('.tab').find((t) => t.textContent.includes('overview')).click();
      await sleep(200);
      window.docshelf.quickOpen.open();
      const input = $('.qo-box input');
      input.value = 'adr';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(200);
      return true;
    },
    async pdf() {
      window.docshelf.quickOpen.close();
      window.docshelf.explorer.reveal('specs/requirements.pdf');
      window.docshelf.tabs.open('specs/requirements.pdf', { pin: true });
      await sleep(1800);
      return true;
    },
  };
})();
