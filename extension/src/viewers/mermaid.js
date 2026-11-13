// Mermaid diagrams in Markdown (```mermaid blocks).
// The library is large, so it is only imported the first time a document
// actually contains a diagram, and then only the code for the diagram types in
// use is loaded. Everything is bundled; nothing is fetched from the network.

import DOMPurify from '../../lib/purify.es.mjs';

let mermaidPromise = null;
let initializedTheme = null;
let seq = 0;

export function isDarkTheme() {
  const t = document.documentElement.dataset.theme;
  return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
}

async function getMermaid() {
  mermaidPromise ??= import('../../lib/mermaid/mermaid.esm.min.mjs').then((m) => m.default);
  const mermaid = await mermaidPromise;
  const theme = isDarkTheme() ? 'dark' : 'default';
  if (theme !== initializedTheme) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict', // no clicks/scripts, labels sanitized
      // HTML in a label (e.g. <img src=…>) must never load anything.
      dompurifyConfig: { FORBID_TAGS: ['img', 'image', 'picture', 'video', 'audio', 'source', 'iframe', 'object', 'embed', 'link', 'style'] },
      theme,
      fontFamily: getComputedStyle(document.body).fontFamily,
    });
    initializedTheme = theme;
  }
  return mermaid;
}

/** Render diagram source to a sanitized SVG element. Throws on syntax errors. */
export async function renderMermaid(code) {
  const mermaid = await getMermaid();
  const id = `docshelf-mmd-${++seq}`;
  try {
    const { svg } = await mermaid.render(id, code);
    const clean = DOMPurify.sanitize(svg, {
      USE_PROFILES: { svg: true, svgFilters: true, html: true },
      ADD_TAGS: ['foreignObject', 'style'],
      HTML_INTEGRATION_POINTS: { foreignobject: true },
      RETURN_DOM_FRAGMENT: true,
    });
    const el = clean.querySelector('svg');
    if (!el) throw new Error('The diagram produced no output.');
    return el;
  } finally {
    // Mermaid renders in a scratch element and can leave it behind on errors.
    document.getElementById(id)?.remove();
    document.getElementById(`d${id}`)?.remove();
  }
}
