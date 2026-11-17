// Math in Markdown ($…$, $$…$$, \(…\), \[…\], ```math), drawn with KaTeX.
// KaTeX and its fonts are bundled and only loaded for documents that contain math.

import { h } from '../util.js';

let katexPromise = null;

function loadKatex() {
  katexPromise ??= new Promise((resolve, reject) => {
    document.head.append(h('link', { rel: 'stylesheet', href: 'lib/katex/katex.min.css' }));
    document.head.append(h('script', {
      src: 'lib/katex/katex.min.js',
      onload: () => resolve(window.katex),
      onerror: () => { katexPromise = null; reject(new Error('KaTeX failed to load')); },
    }));
  });
  return katexPromise;
}

/** Typeset every .math element under `root` (their text is the TeX source). */
export async function renderMath(root, isCurrent) {
  const els = [...root.querySelectorAll('.math')];
  if (!els.length) return;
  const katex = await loadKatex();
  if (!isCurrent()) return;
  const macros = {}; // \def / \newcommand carry over within one document
  for (const el of els) {
    const tex = el.textContent;
    try {
      katex.render(tex, el, {
        displayMode: el.classList.contains('math-display'),
        throwOnError: false, // bad TeX is shown in red, not thrown
        trust: false, // no \href, \includegraphics, …
        strict: 'ignore',
        maxExpand: 1000,
        macros,
      });
      el.classList.add('rendered');
      el.title = '';
    } catch (err) {
      el.textContent = tex;
      el.classList.add('math-error');
      el.title = String(err?.message ?? err);
    }
  }
}
