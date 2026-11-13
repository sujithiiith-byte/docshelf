(() => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const activeView = () => $('.view:not([hidden])');
  async function waitFor(fn, ms = 4000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      try { const v = fn(); if (v) return v; } catch { /* retry */ }
      await sleep(30);
    }
    return null;
  }
  const mouse = (el, type, o = {}) => el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window, ...o }));
  const click = (el, o = {}) => { mouse(el, 'mousedown', o); mouse(el, 'mouseup', o); mouse(el, 'click', { detail: 1, ...o }); };
  const dblclick = (el) => { click(el); click(el, { detail: 2 }); mouse(el, 'dblclick', { detail: 2 }); };
  const key = (code, o = {}) => document.dispatchEvent(new KeyboardEvent('keydown', { code, key: o.key ?? '', bubbles: true, cancelable: true, ...o }));
  const row = (p) => $(`.row[data-path="${CSS.escape(p)}"]`);
  const rows = () => $$('.row').map((e) => e.dataset.path);
  const tabs = () => $$('.tab').map((e) => ({ name: e.querySelector('.title').textContent, preview: e.classList.contains('preview'), active: e.classList.contains('active') }));

  function makePdf(pages) {
    const objs = [];
    const add = (s) => { objs.push(s); return objs.length; };
    const catalog = add(null);
    const pagesObj = add(null);
    const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
    const kids = [];
    for (let i = 1; i <= pages; i++) {
      const text = `BT /F1 28 Tf 72 700 Td (Design spec - page ${i}) Tj ET`;
      const content = add(`<< /Length ${text.length} >>\nstream\n${text}\nendstream`);
      kids.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 612 792] /Contents ${content} 0 R /Resources << /Font << /F1 ${font} 0 R >> >> >>`));
    }
    objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
    objs[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${pages} >>`;
    let out = '%PDF-1.4\n';
    const offsets = [];
    objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
    out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return out;
  }

  const ARCH_MD = `---
title: Architecture
status: draft
---
# Architecture overview

Intro paragraph with **bold**, \`inline code\`, a [link to notes](../notes.txt) and the [API endpoints](api.md#endpoints).

![diagram](../../img/diagram.svg)

## Components

| Name | Role |
| --- | --- |
| Explorer | Shows the folder tree |
| Viewer | Renders documents |

- [x] done item
- [ ] open item

> A blockquote for good measure.

\`\`\`python
def hello(name: str) -> str:
    # greet someone
    return f"hi {name}"
\`\`\`

## Data flow

<script>window.__xss = 1</script>
<img src="x" onerror="window.__xss2 = 1">

### Details

${'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(300)}

## Appendix

End.
`;
  const API_MD = `# API\n\nSome text.\n\n${'Filler paragraph.\n\n'.repeat(80)}## Endpoints\n\nGET /docs\n`;
  const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60"><rect width="200" height="60" rx="8" fill="#2f6fde"/><text x="20" y="38" fill="white" font-size="20" font-family="sans-serif">diagram.svg</text></svg>';
  const FILES = {
    'README.md': '# Project docs\n\nWelcome.\n',
    'docs/design/arch.md': ARCH_MD,
    'docs/design/api.md': API_MD,
    'docs/notes.txt': 'Plain notes.\nLine two.\n',
    'docs/spec.pdf': makePdf(3),
    'img/diagram.svg': SVG,
    'src/main.py': 'print(1)\n',
    'src/util.c': 'int main(){}\n',
    'node_modules/pkg/README.md': '# should be skipped\n',
    '.hidden/secret.md': '# hidden\n',
    'reports/2024/q1.pdf': makePdf(1),
  };

  async function projectDir() {
    const root = await navigator.storage.getDirectory();
    return root.getDirectoryHandle('project-docs', { create: true });
  }

  function suite() {
    const results = [];
    const check = (name, ok, extra = '') => results.push({ name, ok: !!ok, extra: ok ? '' : String(extra) });
    return { results, check };
  }

  window.__e2e = {
    async welcome() {
      const { results, check } = suite();
      check('welcome screen renders', await waitFor(() => $('.welcome-inner .btn.primary')));
      return { results };
    },

    async main() {
      const { results, check } = suite();
      const opfs = await navigator.storage.getDirectory();
      for await (const name of opfs.keys()) await opfs.removeEntry(name, { recursive: true });
      const proj = await projectDir();
      for (const [path, content] of Object.entries(FILES)) {
        const parts = path.split('/');
        let d = proj;
        for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p, { create: true });
        const w = await (await d.getFileHandle(parts.at(-1), { create: true })).createWritable();
        await w.write(content);
        await w.close();
      }
      await window.docshelf.openRoot(proj, { request: false });
      await waitFor(() => $('.row'));

      let r = rows();
      check('code-only folder (src) hidden', !r.includes('src'), r);
      check('node_modules and dot-folders skipped', !r.includes('node_modules') && !r.includes('.hidden'), r);
      check('image-only folder hidden', !r.includes('img'), r);
      check('doc folders shown', ['docs', 'reports', 'README.md'].every((p) => r.includes(p)), r);
      check('status counts documents', $('#status').textContent === '6 documents', $('#status').textContent);
      check('chip counts', $$('.chip .n').map((e) => e.textContent).join(',') === '3,2,1', $$('.chip .n').map((e) => e.textContent));

      click(row('docs'));
      click(row('docs/design'));
      r = rows();
      check('expanding folders works', r.includes('docs/design/arch.md') && r.includes('docs/spec.pdf'), r);

      // Single click -> preview tab
      click(row('docs/design/arch.md'));
      await waitFor(() => activeView()?.querySelector('.markdown-body h1'));
      let t = tabs();
      check('single click opens a preview tab', t.length === 1 && t[0].preview, JSON.stringify(t));
      check('preview tab title is italic', getComputedStyle($('.tab .title')).fontStyle === 'italic');
      check('active file highlighted in tree', row('docs/design/arch.md').classList.contains('active'));

      // Markdown rendering
      await sleep(200);
      const a = activeView().querySelector('.markdown-body');
      const img = a.querySelector('img[data-local-src="../../img/diagram.svg"]');
      check('heading ids', a.querySelector('h1')?.id === 'sec-architecture-overview', a.querySelector('h1')?.id);
      check('code highlighted', a.querySelectorAll('pre code .hljs-keyword').length > 0);
      check('GFM table + task list', a.querySelector('table') && a.querySelectorAll('input[type=checkbox]').length === 2);
      check('front matter shown collapsed', a.querySelector('details.frontmatter:not([open])'));
      check('scripts / event handlers stripped', !a.querySelector('script') && !$$('img').some((i) => i.hasAttribute('onerror')) && !window.__xss && !window.__xss2);
      check('local SVG image loaded from the folder', img?.src.startsWith('blob:') && img.naturalWidth === 200, `${img?.src} ${img?.naturalWidth}`);
      const outline = $$('.view:not([hidden]) .md-outline a').map((x) => x.textContent);
      check('outline lists headings', outline.length === 5, outline.join(' | '));
      check('copy button on code blocks', a.querySelectorAll('.copy-btn').length === 1);
      check('path bar shows breadcrumbs', $('.crumbs').textContent.replace(/\s/g, '') === 'project-docs›docs›design›arch.md', $('.crumbs').textContent);

      // Second single click replaces preview
      click(row('docs/notes.txt'));
      await waitFor(() => activeView()?.querySelector('.text-view')?.textContent.includes('Plain notes'));
      t = tabs();
      check('second single click replaces the preview tab', t.length === 1 && t[0].name === 'notes.txt', JSON.stringify(t));
      check('replaced view was destroyed', $$('.view').length === 1, $$('.view').length);

      // Double-click pins
      dblclick(row('docs/notes.txt'));
      t = tabs();
      check('double click on a file pins its tab', t.length === 1 && !t[0].preview, JSON.stringify(t));

      click(row('docs/design/arch.md'));
      await waitFor(() => activeView()?.querySelector('.markdown-body h1'));
      t = tabs();
      check('pinned + preview tabs side by side', t.length === 2 && !t[0].preview && t[1].preview, JSON.stringify(t));
      dblclick($('.tab.preview'));
      check('double-clicking a preview tab pins it', !$('.tab.preview'));

      // Scroll state across tab switches
      await sleep(100);
      activeView().scrollTop = 1500;
      await sleep(50);
      click($('.tab:not(.active)'));
      await sleep(50);
      click($('.tab:not(.active)'));
      await sleep(50);
      check('scroll position kept across tab switches', Math.abs(activeView().scrollTop - 1500) < 2, activeView().scrollTop);

      // Outline highlight follows scroll
      await sleep(100);
      const cur = $('.view:not([hidden]) .md-outline a.current')?.textContent;
      check('outline highlights current section', cur === 'Details', cur);

      // Relative link with #fragment
      activeView().scrollTop = 0;
      click(activeView().querySelector('a[href="api.md#endpoints"]'));
      await waitFor(() => $('.tab.active .title').textContent === 'api.md');
      await waitFor(() => activeView().scrollTop > 200, 3000);
      check('relative link opens doc and jumps to #anchor', activeView().scrollTop > 200, activeView().scrollTop);
      check('link opened as preview tab', $('.tab.active').classList.contains('preview'));

      // Ctrl+click link -> pinned
      click($$('.tab').find((e) => e.textContent.includes('arch.md')));
      await waitFor(() => activeView()?.querySelector('a[href="../notes.txt"]'));
      click(activeView().querySelector('a[href="../notes.txt"]'), { ctrlKey: true });
      check('ctrl+click on link activates existing tab', $('.tab.active .title').textContent === 'notes.txt');

      // Filters
      click($('.chip[data-type="md"]'));
      r = rows();
      check('MD filter off hides md-only folders', !r.includes('docs/design') && r.includes('docs') && !r.includes('README.md'), r);
      check('status shows filtered count', $('#status').textContent === '3 of 6 documents', $('#status').textContent);
      click($('.chip[data-type="pdf"]'), { shiftKey: true });
      r = rows();
      check('Shift+click shows only PDFs', r.includes('reports') && !r.includes('docs/notes.txt') && r.includes('docs/spec.pdf'), r);
      click($('.chip[data-type="pdf"]'), { shiftKey: true }); // again -> all
      check('Shift+click again restores all types', $$('.chip[aria-pressed="true"]').length === 3);

      // Name filter
      const search = $('#search');
      search.value = 'q1';
      search.dispatchEvent(new Event('input', { bubbles: true }));
      await waitFor(() => $$('.row.file').length === 1);
      r = rows();
      check('name filter shows matches inside their folders', r.join(',') === 'reports,reports/2024,reports/2024/q1.pdf', r);
      search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await waitFor(() => rows().length > 3);
      check('Escape clears the name filter', rows().includes('README.md'));

      // Keyboard navigation in tree
      $('#tree').focus();
      $('#tree').dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
      $('#tree').dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
      $('#tree').dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      await waitFor(() => $('.tab.active .title').textContent === 'README.md');
      check('keyboard: End + Space previews last file', $('.tab.active .title').textContent === 'README.md' && $('.tab.active').classList.contains('preview'));

      // Auto reload of active doc
      click($$('.tab').find((e) => e.textContent.includes('notes.txt')));
      await waitFor(() => activeView()?.querySelector('.text-view'));
      const docs = await proj.getDirectoryHandle('docs');
      const w = await (await docs.getFileHandle('notes.txt')).createWritable();
      await w.write('Plain notes.\nEDITED ON DISK\n');
      await w.close();
      const reloaded = await waitFor(() => activeView().querySelector('.text-view').textContent.includes('EDITED ON DISK'), 5000);
      check('active doc reloads when the file changes on disk', reloaded);

      // Alt+W closes, Alt+] cycles
      const before = tabs().length;
      key('KeyW', { altKey: true });
      check('Alt+W closes the active tab', tabs().length === before - 1, `${before} -> ${tabs().length}`);
      const was = $('.tab.active .title').textContent;
      key('BracketRight', { altKey: true });
      check('Alt+] switches to the next tab', $('.tab.active .title').textContent !== was);
      key('KeyB', { ctrlKey: true });
      check('Ctrl+B hides the sidebar', $('#app').classList.contains('sidebar-hidden'));
      key('KeyB', { ctrlKey: true });

      // Memory cap: open many docs pinned -> at most 4 rendered
      for (const p of ['README.md', 'docs/design/arch.md', 'docs/design/api.md', 'docs/notes.txt', 'docs/spec.pdf', 'reports/2024/q1.pdf']) {
        window.docshelf.tabs.open(p, { pin: true });
        await sleep(150);
      }
      await sleep(300);
      const rendered = $$('.view').filter((v) => v.childElementCount > 0).length;
      check('only a few views stay rendered (memory cap)', rendered <= 4, `${rendered} rendered of ${$$('.view').length}`);
      return { results };
    },

    async markdownShot() {
      const { results, check } = suite();
      click($$('.tab').find((e) => e.textContent.includes('arch.md')));
      await waitFor(() => activeView()?.querySelector('.markdown-body h1'));
      activeView().scrollTop = 0;
      click(row('docs/design/arch.md'));
      await sleep(300);
      check('evicted markdown view re-renders', activeView().querySelector('.markdown-body h1'));
      return { results };
    },

    async pdfShot() {
      const { results, check } = suite();
      click($$('.tab').find((e) => e.textContent.includes('spec.pdf')));
      const frame = await waitFor(() => activeView()?.querySelector('iframe.pdf-frame'));
      check('PDF opens in the built-in viewer frame', frame?.src.startsWith('blob:'), frame?.src);
      check('pdfViewerEnabled', navigator.pdfViewerEnabled, navigator.pdfViewerEnabled);
      return { results };
    },

    async quickOpenStage() {
      const { results, check } = suite();
      check('folder id is kept in the tab URL', /\?f=[\w-]+/.test(location.search), location.search);
      check('browser tab title shows doc and folder', / · project-docs$/.test(document.title), document.title);
      key('KeyP', { ctrlKey: true });
      const box = await waitFor(() => !$('.qo-overlay').hidden && $('.qo-box input'));
      check('Ctrl+P opens quick open', box);
      const input = $('.qo-box input');
      input.value = 'dapi';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      const first = $('.qo-item.selected .label')?.textContent;
      check('fuzzy match ranks the right file first', first === 'api.md', first);
      await sleep(100);
      return { results };
    },

    async searchStage() {
      const { results, check } = suite();
      const input = $('.qo-box input');
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      check('Enter opens the picked doc as a kept tab', $('.tab.active .title').textContent === 'api.md' && !$('.tab.active').classList.contains('preview'));
      check('quick open closes after picking', $('.qo-overlay').hidden);

      key('KeyF', { ctrlKey: true, shiftKey: true });
      check('Ctrl+Shift+F shows the search panel', $('#app').classList.contains('mode-search') && !!$('.search-panel input'));
      const si = $('.search-panel input');
      si.value = 'filler';
      si.dispatchEvent(new Event('input', { bubbles: true }));
      await waitFor(() => /match/.test($('.search-status').textContent), 4000);
      check('search counts matches', /^50\+? match/.test($('.search-status').textContent), $('.search-status').textContent);
      si.value = 'lorem';
      si.dispatchEvent(new Event('input', { bubbles: true }));
      await waitFor(() => $('.hit mark')?.textContent.toLowerCase() === 'lorem' && /match/.test($('.search-status').textContent), 4000);
      check('search results show line previews with marks', $('.hit mark')?.textContent.toLowerCase() === 'lorem', $('.hit')?.textContent);
      const hits = $$('.hit');
      click(hits[2]);
      await waitFor(() => $('.tab.active .title').textContent === 'arch.md' && CSS.highlights.has('docshelf-current'), 4000);
      check('clicking a hit opens the doc and highlights the match', $('.tab.active .title').textContent === 'arch.md' && CSS.highlights.has('docshelf-current'));
      const cur = [...(CSS.highlights.get('docshelf-current') ?? [])][0];
      const r = cur?.getBoundingClientRect();
      check('highlighted match is scrolled into view', r && r.top > 60 && r.bottom < innerHeight, r && `${r.top}`);
      si.value = 'plain notes';
      si.dispatchEvent(new Event('input', { bubbles: true }));
      await waitFor(() => $('.hit-file .label')?.textContent === 'notes.txt', 4000);
      check('search includes text files', $('.hit-file .label')?.textContent === 'notes.txt', $('.hit-file .label')?.textContent);
      si.value = 'lorem';
      si.dispatchEvent(new Event('input', { bubbles: true }));
      await waitFor(() => $('.hit mark')?.textContent.toLowerCase() === 'lorem', 4000);
      click($$('.hit')[2]);
      await sleep(300);
      return { results };
    },

    async menuStage() {
      const { results, check } = suite();
      $('.search-panel').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      check('Escape leaves search and clears highlights', !$('#app').classList.contains('mode-search') && !CSS.highlights.has('docshelf-current'));
      check('Print button for Markdown', $$('.bar-actions .tb-btn').some((b) => b.textContent === 'Print'));
      const tab = $('.tab.active');
      const r = tab.getBoundingClientRect();
      tab.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.bottom - 4 }));
      const items = $$('.ctx-menu .ctx-item').map((b) => b.textContent);
      check('right-click on a tab shows a menu', items.some((t) => t.startsWith('Close others')), items.join(' | '));
      return { results };
    },

    async afterMenu() {
      const { results, check } = suite();
      const before = tabs().length;
      click($$('.ctx-menu .ctx-item').find((b) => b.textContent.startsWith('Close others')));
      check('“Close others” keeps only that tab', tabs().length === 1 && before > 1 && $('.tab.active .title').textContent === 'arch.md', `${before} -> ${tabs().length}`);
      check('menu closes after choosing', !$('.ctx-menu'));
      window.docshelf.explorer.reveal('docs/design/api.md');
      row('docs/design/api.md').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 50, clientY: 50 }));
      click($$('.ctx-menu .ctx-item').find((b) => b.textContent.startsWith('Open and keep open')));
      check('file menu “Open and keep open” pins', $('.tab.active .title').textContent === 'api.md' && !$('.tab.active').classList.contains('preview'));
      for (const p of ['docs/notes.txt', 'docs/spec.pdf', 'README.md']) window.docshelf.tabs.open(p, { pin: true });
      await sleep(300);
      return { results };
    },

    async secondTab() {
      const { results, check } = suite();
      await waitFor(() => $('.welcome-inner'), 4000);
      await sleep(300);
      check('second DocShelf tab does not grab the open folder', !window.docshelf.state.root && $('#app').classList.contains('no-root'));
      const label = $$('.recent-open').find((b) => b.textContent === 'project-docs');
      check('recent list marks folder open in another tab', label?.classList.contains('elsewhere'), label?.className);
      return { results };
    },

    async secondTabOpen() {
      const { results, check } = suite();
      const opfs = await navigator.storage.getDirectory();
      const other = await opfs.getDirectoryHandle('other-docs', { create: true });
      const w = await (await other.getFileHandle('roadmap.md', { create: true })).createWritable();
      await w.write('# Roadmap\n\nQ3 plans.\n');
      await w.close();
      await window.docshelf.openRoot(other, { request: false });
      await waitFor(() => $('.row'));
      check('second tab shows its own folder', rows().join(',') === 'roadmap.md' && $('#rootName').textContent === 'other-docs', rows());
      check('second tab URL has its own folder id', /\?f=/.test(location.search));
      click(row('roadmap.md'));
      await waitFor(() => activeView()?.querySelector('.markdown-body h1'));
      return { results };
    },

    async firstTabUnchanged() {
      const { results, check } = suite();
      check('first tab still shows its folder', $('#rootName').textContent === 'project-docs' && rows().includes('docs'), $('#rootName').textContent);
      return { results };
    },

    async splitStage() {
      const { results, check } = suite();
      // Explorer hide/show buttons
      click($('#btnHideSidebar'));
      check('hide button collapses the explorer to a slim rail', $('#app').classList.contains('sidebar-hidden') && $('#btnShowSidebar').offsetParent !== null);
      click($('#btnShowSidebar'));
      check('rail button brings the explorer back', !$('#app').classList.contains('sidebar-hidden') && $('#tree').offsetParent !== null);

      // Split view
      const archTab = $$('.tab').find((t) => t.textContent.includes('arch.md'));
      click(archTab);
      await waitFor(() => activeView()?.querySelector('.markdown-body h1'));
      key('Backslash', { ctrlKey: true });
      await waitFor(() => $$('.group').length === 2 && $$('.group')[1].querySelector('.markdown-body h1'), 4000);
      const [left, right] = $$('.group');
      check('Ctrl+\\ splits the view into two groups', $$('.group').length === 2 && $('.groups').classList.contains('split'));
      check('the doc opens on the right and that side is active', right?.classList.contains('active-group') && right.querySelector('.tab.active .title')?.textContent === 'arch.md');
      check('the left side keeps its tabs', left.querySelectorAll('.tab').length >= 1);
      check('split button shown in the path bar', !!right.querySelector('.bar-actions .tb-icon'));

      // Alt+click in the explorer opens on the other side (left, since right is active)
      window.docshelf.explorer.reveal('README.md');
      click(row('README.md'), { altKey: true });
      await waitFor(() => left.querySelector('.tab.active .title')?.textContent === 'README.md');
      check('Alt+click opens a file on the other side', left.querySelector('.tab.active .title')?.textContent === 'README.md' && left.classList.contains('active-group'));

      // Clicking in a group makes it active; new docs open there
      mouse(right.querySelector('.views'), 'pointerdown');
      click(row('docs/notes.txt'));
      await waitFor(() => right.querySelector('.tab.active .title')?.textContent === 'notes.txt');
      check('docs open in the group you last clicked', right.querySelector('.tab.active .title')?.textContent === 'notes.txt');
      await sleep(400);
      const saved = Object.keys(localStorage).filter((k) => k.startsWith('docshelf:ws:')).map((k) => JSON.parse(localStorage.getItem(k))).find((w) => w.split);
      check('split layout is saved with the folder', saved?.split?.tabs?.length >= 2, JSON.stringify(saved?.split));
      return { results };
    },

    async splitClose() {
      const { results, check } = suite();
      const right = $$('.group')[1];
      for (let i = 0; i < 20 && right.isConnected && right.querySelector('.tab .close'); i++) click(right.querySelector('.tab .close'));
      await sleep(100);
      check('closing the last tab on one side removes the split', $$('.group').length === 1 && !$('.groups').classList.contains('split') && !$('.group-resizer'));
      check('the remaining side is active', $('.group').classList.contains('active-group'));
      return { results };
    },

    async richStage() {
      const { results, check } = suite();
      const FLOWS = [
        '# Flows', '',
        '> [!NOTE]', '> Read the [architecture](arch.md) first.', '',
        '> [!WARNING]', '> Second alert.', '',
        '> Plain quote.', '',
        'A claim that needs a source[^1] and another[^note].', '',
        '![diagram](../../img/diagram.svg) ![build status](https://example.com/badge.svg)', '',
        '```mermaid', 'flowchart LR', '  A["Client <img src=x onerror=window.__mxss=1>"] --> B[Gateway] --> C[Doc service]', '```', '',
        '```mermaid', 'sequenceDiagram', '  Alice->>Bob: Hello', '  Bob-->>Alice: Hi', '```', '',
        '```mermaid', 'flowchart LR', '  A --> ', '```', '',
        '[^1]: First footnote.', '[^note]: Second **footnote**.', '',
      ].join('\n');
      const design = await (await (await projectDir()).getDirectoryHandle('docs')).getDirectoryHandle('design');
      const w = await (await design.getFileHandle('flows.md', { create: true })).createWritable();
      await w.write(FLOWS);
      await w.close();
      window.docshelf.tabs.open('docs/design/flows.md', { pin: true });
      const a = await waitFor(() => activeView()?.querySelector('.markdown-body .md-alert'));
      const alerts = $$('.view:not([hidden]) .md-alert');
      check('GitHub alerts render with titles', alerts.length === 2 && alerts[0].querySelector('.md-alert-title').textContent === 'Note' && alerts[1].classList.contains('md-alert-warning'), alerts.length);
      check('alert marker text is removed', a && !a.textContent.includes('[!NOTE]') && a.querySelector('a[href="arch.md"]'), a?.textContent);
      check('web images are not loaded (offline label instead)', activeView().querySelector('.remote-img')?.textContent === 'build status' && !$$('img').some((i) => /example\.com/.test(i.src)));
      check('plain blockquotes are unchanged', activeView().querySelectorAll('.markdown-body > blockquote').length === 1);
      const refs = $$('.view:not([hidden]) .fn-ref a').map((x) => x.textContent).join(',');
      const notes = $$('.view:not([hidden]) .footnotes li');
      check('footnotes are numbered and listed at the end', refs === '1,2' && notes.length === 2 && notes[1].querySelector('strong') && notes[0].querySelector('a.fn-back[href="#fnref-1"]'), `${refs} / ${notes.length}`);

      const drawn = await waitFor(() => activeView().querySelectorAll('.mermaid-diagram svg').length === 2 && activeView().querySelector('.mmd-error'), 20000);
      check('mermaid diagrams render as SVG', drawn && activeView().querySelector('.mermaid-diagram svg').textContent.includes('Gateway'), activeView().querySelectorAll('.mermaid-block').length);
      check('a broken diagram shows its source and an error', activeView().querySelector('.mmd-error pre.mermaid-src') && activeView().querySelector('.mmd-error .mmd-msg')?.textContent.startsWith("This diagram couldn't"));
      check('diagram labels cannot run scripts', !window.__mxss && !activeView().querySelector('.mermaid-diagram [onerror]'));
      check('no mermaid scratch elements left behind', !$$('body > *').some((e) => /docshelf-mmd/.test(e.id)), $$('body > *').map((e) => e.id).join(','));

      document.documentElement.dataset.theme = 'dark';
      check('diagrams redraw for the dark theme', await waitFor(() => activeView().querySelector('.mermaid-block.mmd-dark .mermaid-diagram svg'), 8000));
      delete document.documentElement.dataset.theme;
      check('and back for light', await waitFor(() => !activeView().querySelector('.mermaid-block.mmd-dark') && activeView().querySelector('.mermaid-diagram svg'), 8000));

      click(activeView().querySelector('.mermaid-diagram'));
      check('clicking a diagram opens it full-window', $('.lightbox svg') && $('.lb-zoom').textContent.endsWith('%'));
      key('Escape', { key: 'Escape' });
      check('Esc closes the full-window view', !$('.lightbox'));
      const img = await waitFor(() => activeView().querySelector('.markdown-body img[src^="blob:"]'));
      await img?.decode().catch(() => {});
      click(img);
      check('clicking a picture opens it full-window', $('.lightbox img') && $('.lb-title').textContent === 'diagram', $('.lb-title')?.textContent);
      key('Escape', { key: 'Escape' });
      return { results };
    },

    async navStage() {
      const { results, check } = suite();
      for (const t of [...window.docshelf.tabs.tabs]) window.docshelf.tabs.close(t.id);
      window.docshelf.explorer.reveal('docs/design/arch.md');
      click(row('docs/design/arch.md'));
      await waitFor(() => activeView()?.querySelector('.markdown-body h1'));
      activeView().scrollTop = 1500;
      await sleep(50);
      click(activeView().querySelector('a[href="api.md#endpoints"]'));
      await waitFor(() => tabs().find((t) => t.active)?.name === 'api.md' && activeView()?.querySelector('.markdown-body h1'));
      check('following a link replaces the preview', tabs().length === 1 && tabs()[0].name === 'api.md', JSON.stringify(tabs()));
      key('ArrowLeft', { key: 'ArrowLeft', altKey: true });
      await waitFor(() => tabs().find((t) => t.active)?.name === 'arch.md' && activeView()?.querySelector('.markdown-body h1'));
      await waitFor(() => Math.abs(activeView().scrollTop - 1500) < 5, 5000); // restored once the doc has loaded
      check('Alt+Left goes back to the previous document', tabs().find((t) => t.active)?.name === 'arch.md', JSON.stringify(tabs()));
      check('...at the same scroll position', Math.abs(activeView().scrollTop - 1500) < 5, activeView().scrollTop);
      key('ArrowRight', { key: 'ArrowRight', altKey: true });
      await waitFor(() => tabs().find((t) => t.active)?.name === 'api.md');
      check('Alt+Right goes forward again', tabs().find((t) => t.active)?.name === 'api.md', JSON.stringify(tabs()));
      mouse($('.views'), 'mouseup', { button: 3 });
      await waitFor(() => tabs().find((t) => t.active)?.name === 'arch.md');
      check('the mouse back button goes back too', tabs().find((t) => t.active)?.name === 'arch.md', JSON.stringify(tabs()));
      check('...without leaving DocShelf', location.pathname.endsWith('/workspace.html'));
      return { results };
    },

    async beforeReload() {
      const { results } = suite();
      window.__tabsBefore = JSON.stringify(tabs().map((t) => t.name));
      sessionStorage.setItem('tabsBefore', window.__tabsBefore);
      return { results };
    },

    async afterReload() {
      const { results, check } = suite();
      await waitFor(() => $('.tab'), 5000);
      const now = JSON.stringify(tabs().map((t) => t.name));
      check('folder + open tabs restored after reload', now === sessionStorage.getItem('tabsBefore'), `${sessionStorage.getItem('tabsBefore')} vs ${now}`);
      document.documentElement.dataset.theme = 'dark';
      click($$('.tab').find((e) => e.textContent.includes('arch.md')));
      await waitFor(() => activeView()?.querySelector('.markdown-body h1'));
      activeView().scrollTop = 0;
      return { results };
    },

    async narrow() {
      const { results, check } = suite();
      delete document.documentElement.dataset.theme;
      // Simulate a new browser session: no tabs, permission not yet re-granted.
      for (const t of [...window.docshelf.tabs.tabs]) window.docshelf.tabs.close(t.id);
      const { renderWelcome } = await import('./src/ui/welcome.js');
      let reopened = null;
      renderWelcome($('#welcome'), {
        rootName: null, currentId: null, unsupported: false, openElsewhere: new Set(),
        recents: [{ id: 'a', name: 'project-docs' }, { id: 'b', name: 'old-notes' }],
        suggested: { id: 'a', name: 'project-docs' },
        onPick() {}, onOpenRecent: (r) => { reopened = r.name; }, onForget() {},
      });
      const btn = $('.welcome-actions .btn.primary');
      check('welcome offers one-click reopen of last folder', btn?.textContent === 'Reopen “project-docs”', btn?.textContent);
      click(btn);
      check('reopen button opens that folder', reopened === 'project-docs', reopened);
      return { results };
    },
  };
})();
