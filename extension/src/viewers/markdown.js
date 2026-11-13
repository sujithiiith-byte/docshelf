// Markdown viewer: GitHub-flavoured Markdown -> sanitized HTML, with syntax
// highlighting, an "On this page" outline, local images, and links between
// documents that open in tabs.

import { Marked } from '../../lib/marked.esm.js';
import DOMPurify from '../../lib/purify.es.mjs';
import hljs from '../../lib/highlight.min.js';
import { h, dirname, basename, resolvePath, safeDecode, escapeHtml, store, toast, toggleButton } from '../util.js';
import { typeOf } from '../fs/types.js';
import { highlightText, scrollRangeIntoView } from './highlight.js';
import { renderMermaid, isDarkTheme } from './mermaid.js';
import { openLightbox } from '../ui/lightbox.js';

const ID_PREFIX = 'sec-'; // keeps heading ids from clashing with page/DOM names

// ---- Markdown -> HTML -------------------------------------------------------

let slugCounts = new Map();
function slugify(text) {
  const base = text
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/\s/g, '-') || 'section';
  const n = slugCounts.get(base) ?? 0;
  slugCounts.set(base, n + 1);
  return n ? `${base}-${n}` : base;
}

// Footnotes ([^id] references and [^id]: definitions), numbered in the order
// they are first referenced, listed at the end like GitHub does.
let footnotes = new Map(); // lower-cased id -> { tokens, n, refs }
let footnoteCount = 0;

const ALERTS = { note: 'Note', tip: 'Tip', important: 'Important', warning: 'Warning', caution: 'Caution' };

const marked = new Marked({ gfm: true });
marked.use({
  hooks: {
    preprocess(src) {
      slugCounts = new Map();
      footnotes = new Map();
      footnoteCount = 0;
      return src;
    },
    postprocess(html) {
      const used = [...footnotes.values()].filter((f) => f.n).sort((a, b) => a.n - b.n);
      if (!used.length) return html;
      const items = used.map((f) => {
        const back = `<a href="#fnref-${f.n}" class="fn-back" aria-label="Back to reference ${f.n}">↩</a>`;
        let body = marked.parser(f.tokens).trim();
        body = /<\/p>$/.test(body) ? body.replace(/<\/p>$/, ` ${back}</p>`) : `${body} ${back}`;
        return `<li id="fn-${f.n}">${body}</li>`;
      });
      return `${html}<section class="footnotes" aria-label="Footnotes"><ol>${items.join('')}</ol></section>`;
    },
  },
  extensions: [
    {
      name: 'footnoteDef',
      level: 'block',
      start: (src) => src.match(/^\[\^[^\]\s]+\]:/m)?.index,
      tokenizer(src) {
        // First line plus any following lines indented by 2+ spaces or a tab.
        const m = /^\[\^([^\]\s]+)\]:[ \t]*([^\n]*(?:\n(?: {2,}|\t)[^\n]*)*)(?:\n|$)/.exec(src);
        if (!m) return undefined;
        const text = m[2].replace(/\n(?: {2,4}|\t)/g, '\n');
        const key = m[1].toLowerCase();
        const token = { type: 'footnoteDef', raw: m[0], tokens: this.lexer.blockTokens(text, []) };
        if (!footnotes.has(key)) footnotes.set(key, { tokens: token.tokens, n: 0, refs: 0 });
        return token;
      },
      renderer: () => '',
    },
    {
      name: 'footnoteRef',
      level: 'inline',
      start: (src) => { const i = src.indexOf('[^'); return i < 0 ? undefined : i; },
      tokenizer(src) {
        const m = /^\[\^([^\]\s]+)\]/.exec(src);
        const f = m && footnotes.get(m[1].toLowerCase());
        if (!f) return undefined;
        f.n ||= ++footnoteCount;
        f.refs++;
        return { type: 'footnoteRef', raw: m[0], n: f.n, ref: f.refs };
      },
      renderer: ({ n, ref }) => `<sup class="fn-ref"><a href="#fn-${n}" id="fnref-${n}${ref > 1 ? `-${ref}` : ''}">${n}</a></sup>`,
    },
  ],
  renderer: {
    // GitHub alerts: > [!NOTE], [!TIP], [!IMPORTANT], [!WARNING], [!CAUTION]
    blockquote({ tokens }) {
      const m = tokens[0]?.type === 'paragraph' && /^\[!(\w+)\][ \t]*(?:\n|$)/.exec(tokens[0].raw);
      const kind = m && m[1].toLowerCase();
      if (!kind || !ALERTS[kind]) return false;
      const body = this.parser.parse(tokens).replace(/^<p>\[!\w+\][ \t]*\n?/, '<p>').replace(/^<p><\/p>\n?/, '');
      return `<div class="md-alert md-alert-${kind}"><p class="md-alert-title">${ALERTS[kind]}</p>${body}</div>\n`;
    },
    heading({ tokens, depth, text }) {
      const id = ID_PREFIX + slugify(text);
      return `<h${depth} id="${escapeHtml(id)}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
    },
    code({ text, lang }) {
      const language = (lang || '').trim().split(/\s+/)[0].toLowerCase();
      if (language === 'mermaid') return `<pre class="mermaid-src"><code>${escapeHtml(text)}</code></pre>\n`;
      let body = escapeHtml(text);
      if (language && hljs.getLanguage(language)) {
        try { body = hljs.highlight(text, { language, ignoreIllegals: true }).value; } catch { /* plain */ }
      }
      const cls = language ? `hljs language-${escapeHtml(language)}` : 'hljs';
      return `<pre><code class="${cls}">${body}</code></pre>\n`;
    },
  },
});

function splitFrontMatter(src) {
  const m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(src);
  return m ? { frontMatter: m[1], body: src.slice(m[0].length) } : { frontMatter: null, body: src };
}

const isExternal = (url) => /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(url);

// Outline visibility is a global preference shared by all Markdown tabs.
const root = document.documentElement;
root.classList.toggle('md-no-outline', !store.get('md.outline', true));

// Diagrams are drawn for the current theme; redraw them when it changes.
const themeListeners = new Set();
const onThemeChange = () => themeListeners.forEach((fn) => fn());
new MutationObserver(onThemeChange).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', onThemeChange);

const firstLine = (err) => String(err?.message ?? err).split('\n').find((l) => l.trim())?.trim() ?? 'unknown error';

// ---- Viewer -----------------------------------------------------------------

function create(el, ctx) {
  el.classList.add('md-view');
  const article = h('article', { class: 'markdown-body' });
  const source = h('pre', { class: 'md-source', hidden: true });
  const outline = h('nav', { class: 'md-outline', 'aria-label': 'On this page' });
  el.append(h('div', { class: 'md-layout' }, article, source, outline));

  let objectUrls = [];
  let headings = [];
  let currentHeading = null;
  let renderSeq = 0;
  let disposed = false;
  let raf = 0;
  let diagrams = []; // { block, pre, code }
  let diagramsDark = null;

  const toolbar = h(
    'div',
    { class: 'tb-group' },
    toggleButton('Outline', 'Show or hide the outline', !root.classList.contains('md-no-outline'), (on) => {
      store.set('md.outline', on);
      root.classList.toggle('md-no-outline', !on);
    }),
    toggleButton('Source', 'Show the raw Markdown', false, (on) => {
      article.hidden = on;
      source.hidden = !on;
      el.classList.toggle('showing-source', on);
    }),
  );

  function revokeUrls() {
    objectUrls.forEach((u) => URL.revokeObjectURL(u));
    objectUrls = [];
  }

  function scrollToEl(target) {
    el.scrollTop += target.getBoundingClientRect().top - el.getBoundingClientRect().top - 12;
  }

  function findAnchor(fragment) {
    const id = safeDecode(fragment);
    for (const candidate of [ID_PREFIX + id, ID_PREFIX + id.toLowerCase(), id]) {
      const t = article.querySelector(`[id="${CSS.escape(candidate)}"]`);
      if (t) return t;
    }
    return article.querySelector(`[name="${CSS.escape(id)}"]`);
  }

  function reveal(fragment) {
    if (!fragment) return;
    const t = findAnchor(fragment);
    if (t) scrollToEl(t);
  }

  // Links: #anchors scroll, web links open in a browser tab, relative links to
  // other documents open in DocShelf (Ctrl/middle-click = keep open).
  function onLink(e) {
    if (e.type === 'auxclick' && e.button !== 1) return;
    const a = e.target.closest('a[href]');
    if (!a) return;
    e.preventDefault();
    const href = a.getAttribute('href').trim();
    if (href.startsWith('#')) return reveal(href.slice(1));
    if (/^(https?|mailto):/i.test(href)) return void window.open(href, '_blank', 'noopener,noreferrer');
    if (isExternal(href)) return;

    const hashAt = href.indexOf('#');
    const pathPart = (hashAt < 0 ? href : href.slice(0, hashAt)).split('?')[0];
    const fragment = hashAt < 0 ? null : href.slice(hashAt + 1);
    const target = pathPart ? resolvePath(dirname(ctx.path), safeDecode(pathPart)) : ctx.path;
    if (target == null) return toast('That link points outside the opened folder.');
    if (!typeOf(basename(target))) return toast(`“${basename(target)}” isn't a document DocShelf can show.`);
    ctx.workspace.open(target, { pin: e.ctrlKey || e.metaKey || e.button === 1, fragment });
  }
  article.addEventListener('click', onLink);
  article.addEventListener('auxclick', onLink);

  // Click a diagram or a picture to see it full-window.
  article.addEventListener('click', (e) => {
    const diagram = e.target.closest('.mermaid-diagram');
    if (diagram) {
      const svg = diagram.querySelector('svg');
      if (svg) openLightbox(svg.cloneNode(true), { title: 'Diagram' });
      return;
    }
    const img = e.target.closest('img');
    if (!img || img.closest('a') || !img.currentSrc || img.classList.contains('broken') || !img.naturalWidth) return;
    openLightbox(h('img', { src: img.currentSrc, alt: img.alt }), {
      title: img.alt || basename(img.dataset.localSrc ?? img.currentSrc),
      width: img.naturalWidth,
      height: img.naturalHeight,
    });
  });

  // Code blocks get a copy button.
  article.addEventListener('click', (e) => {
    const btn = e.target.closest('.copy-btn');
    if (!btn) return;
    navigator.clipboard.writeText(btn.parentElement.querySelector('code')?.textContent ?? '').then(
      () => { btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = 'Copy'; }, 1200); },
      () => toast('Could not copy to the clipboard.'),
    );
  });

  function buildOutline() {
    headings = [...article.querySelectorAll('h1, h2, h3')];
    currentHeading = null;
    el.classList.toggle('outline-empty', headings.length < 2);
    if (headings.length < 2) { outline.replaceChildren(); return; }
    const minLevel = Math.min(...headings.map((x) => Number(x.tagName[1])));
    outline.replaceChildren(
      h('div', { class: 'outline-title', text: 'On this page' }),
      h('ul', null, headings.map((hd) => h('li', { class: `lvl-${Number(hd.tagName[1]) - minLevel}` },
        h('a', { href: `#${hd.id}`, 'data-id': hd.id, text: hd.textContent, title: hd.textContent })))),
    );
    updateCurrentHeading();
  }

  outline.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-id]');
    if (!a) return;
    e.preventDefault();
    const t = article.querySelector(`[id="${CSS.escape(a.dataset.id)}"]`);
    if (t) scrollToEl(t);
  });

  function updateCurrentHeading() {
    if (headings.length < 2 || el.hidden) return; // no layout while in a background tab
    const line = el.getBoundingClientRect().top + 80;
    let cur = headings[0];
    for (const hd of headings) {
      if (hd.getBoundingClientRect().top <= line) cur = hd;
      else break;
    }
    if (cur === currentHeading) return;
    currentHeading = cur;
    outline.querySelector('a.current')?.classList.remove('current');
    const link = outline.querySelector(`a[data-id="${CSS.escape(cur.id)}"]`);
    if (link) {
      link.classList.add('current');
      link.scrollIntoView({ block: 'nearest' });
    }
  }

  function onScroll() {
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; updateCurrentHeading(); });
  }
  el.addEventListener('scroll', onScroll, { passive: true });

  async function loadLocalImages(seq) {
    const base = dirname(ctx.path);
    const imgs = [...article.querySelectorAll('img[data-local-src]')];
    await Promise.all(imgs.map(async (img) => {
      const target = resolvePath(base, safeDecode(img.dataset.localSrc.split(/[?#]/)[0]));
      try {
        if (target == null) throw new Error('outside folder');
        let file = await (await ctx.workspace.getFileHandle(target)).getFile();
        if (seq !== renderSeq || disposed) return;
        if (/\.svg$/i.test(target) && file.type !== 'image/svg+xml') file = new Blob([file], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(file);
        objectUrls.push(url);
        img.src = url;
        await img.decode().catch(() => {});
      } catch {
        img.classList.add('broken');
        img.title = `Image not found: ${target ?? img.dataset.localSrc}`;
      }
    }));
  }

  async function renderDiagrams(seq) {
    if (!diagrams.length) return;
    const dark = isDarkTheme();
    diagramsDark = dark;
    for (const d of diagrams) {
      try {
        const svg = await renderMermaid(d.code);
        if (seq !== renderSeq || disposed || diagramsDark !== dark) return;
        d.block.classList.remove('mmd-error');
        d.block.classList.toggle('mmd-dark', dark);
        d.block.replaceChildren(h('div', { class: 'mermaid-diagram', title: 'Click to enlarge' }, svg));
      } catch (err) {
        if (seq !== renderSeq || disposed || diagramsDark !== dark) return;
        d.block.classList.add('mmd-error');
        d.block.replaceChildren(d.pre, h('div', { class: 'mmd-msg', text: `This diagram couldn't be drawn: ${firstLine(err)}` }));
      }
    }
  }

  const onTheme = () => {
    if (diagrams.length && isDarkTheme() !== diagramsDark) renderDiagrams(renderSeq);
  };
  themeListeners.add(onTheme);

  async function load(file) {
    const seq = ++renderSeq;
    let text = await file.text();
    if (seq !== renderSeq || disposed) return;
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    source.textContent = text;

    const { frontMatter, body } = splitFrontMatter(text);
    const html = DOMPurify.sanitize(marked.parse(body), { FORBID_TAGS: ['style', 'form'] });

    // Parse into an inert <template> so relative images don't try to load
    // from the extension's own URL before we point them at the real files.
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    for (const img of tpl.content.querySelectorAll('img[src]')) {
      const src = img.getAttribute('src');
      img.removeAttribute('srcset');
      if (/^(?:https?:)?\/\//i.test(src)) {
        // DocShelf never goes online, so web images become a quiet label.
        let host = '';
        try { host = new URL(src, 'https://x/').host; } catch { /* keep empty */ }
        img.replaceWith(h('span', { class: 'remote-img', title: `Image from ${host || 'the web'}: not loaded, DocShelf works offline`, text: img.alt || 'Web image' }));
      } else if (!isExternal(src)) {
        img.removeAttribute('src');
        img.dataset.localSrc = src;
      }
    }
    diagrams = [...tpl.content.querySelectorAll('pre.mermaid-src')].map((pre) => {
      const block = h('div', { class: 'mermaid-block' });
      pre.replaceWith(block);
      block.append(pre);
      return { block, pre, code: pre.textContent };
    });
    for (const pre of tpl.content.querySelectorAll('pre')) {
      pre.append(h('button', { class: 'copy-btn', type: 'button', text: 'Copy' }));
    }

    revokeUrls();
    article.replaceChildren();
    if (frontMatter != null) {
      article.append(h('details', { class: 'frontmatter' }, h('summary', { text: 'Front matter' }), h('pre', { text: frontMatter })));
    }
    article.append(tpl.content);
    buildOutline();
    await Promise.all([loadLocalImages(seq), renderDiagrams(seq)]);
  }

  // Highlight search matches and scroll to occurrence `index`.
  function find(query, index = 0) {
    const range = highlightText(article.hidden ? source : article, query, index);
    if (range) scrollRangeIntoView(el, range);
    return !!range;
  }

  return {
    toolbar,
    load,
    reveal,
    find,
    getViewState: () => ({ scrollTop: el.scrollTop }),
    setViewState(state) {
      if (state) el.scrollTop = state.scrollTop;
      updateCurrentHeading();
    },
    destroy() {
      disposed = true;
      themeListeners.delete(onTheme);
      cancelAnimationFrame(raf);
      el.removeEventListener('scroll', onScroll);
      revokeUrls();
      el.replaceChildren();
    },
  };
}

export default { create, capabilities: { edit: false } };
