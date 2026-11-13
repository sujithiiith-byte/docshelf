// Maps a document type to its viewer module. Modules (and the libraries they
// import) load on first use only, so e.g. the Markdown parser is never loaded
// if you only read PDFs.

const LOADERS = {
  md: () => import('./markdown.js'),
  pdf: () => import('./pdf.js'),
  txt: () => import('./text.js'),
};

const cache = new Map();

export function loadViewer(type) {
  const loader = LOADERS[type] ?? LOADERS.txt;
  if (!cache.has(type)) cache.set(type, loader().then((m) => m.default));
  return cache.get(type);
}
