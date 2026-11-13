// Markdown viewer: GitHub-flavoured Markdown -> sanitized HTML, with syntax
// highlighting, an "On this page" outline, local images, and links between
// documents that open in tabs.

import { Marked } from '../../lib/marked.esm.js';
import DOMPurify from '../../lib/purify.es.mjs';
import hljs from '../../lib/highlight.min.js';
import { h, dirname, basename, resolvePath, safeDecode, escapeHtml, store, toast, toggleButton } from '../util.js';
import { typeOf } from '../fs/types.js';
import { highlightText, scrollRangeIntoView } from './highlight.js';

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

const marked = new Marked({ gfm: true });
marked.use({
  hooks: {
    preprocess(src) {
      slugCounts = new Map();
      return src;
    },
  },
  renderer: {
    heading({ tokens, depth, text }) {
      const id = ID_PREFIX + slugify(text);
      return `<h${depth} id="${escapeHtml(id)}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
    },
    code({ text, lang }) {
      const language = (lang || '').trim().split(/\s+/)[0].toLowerCase();
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
      if (!isExternal(src)) {
        img.removeAttribute('src');
        img.dataset.localSrc = src;
      }
    }
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
    await loadLocalImages(seq);
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
      cancelAnimationFrame(raf);
      el.removeEventListener('scroll', onScroll);
      revokeUrls();
      el.replaceChildren();
    },
  };
}

export default { create, capabilities: { edit: false } };
