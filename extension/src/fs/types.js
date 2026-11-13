// The document types DocShelf shows. Everything else (code, binaries, …) is ignored.
// To support a new type: add it here and add a viewer in src/viewers/registry.js.

export const TYPES = {
  md: { label: 'Markdown', short: 'MD', exts: ['md', 'markdown', 'mdown', 'mkd'] },
  pdf: { label: 'PDF', short: 'PDF', exts: ['pdf'] },
  txt: { label: 'Text', short: 'TXT', exts: ['txt', 'text'] },
};

const EXT_TO_TYPE = new Map();
for (const [type, def] of Object.entries(TYPES)) {
  for (const ext of def.exts) EXT_TO_TYPE.set(ext, type);
}

/** 'notes/Plan.MD' -> 'md'; unknown -> null */
export function typeOf(name) {
  const slash = name.lastIndexOf('/');
  const dot = name.lastIndexOf('.');
  if (dot <= slash + 1) return null; // no extension, or a dotfile
  return EXT_TO_TYPE.get(name.slice(dot + 1).toLowerCase()) ?? null;
}
