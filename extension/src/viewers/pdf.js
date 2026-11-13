// PDF viewer: hands the file to Chrome's built-in PDF viewer (page navigation,
// zoom, search, print). Adds nothing to the extension's size and renders out of
// process, so it stays fast even for large PDFs.

import { h, basename } from '../util.js';

function create(el, ctx) {
  if (!navigator.pdfViewerEnabled) {
    el.append(h('div', { class: 'view-msg error' },
      h('strong', { text: 'Chrome\'s PDF viewer is turned off' }),
      h('div', { text: 'Turn off “Download PDFs” in chrome://settings/content/pdfDocuments, then reopen this tab.' })));
    return { load: async () => {}, getViewState: () => null, setViewState() {}, destroy() { el.replaceChildren(); } };
  }

  const frame = h('iframe', { class: 'pdf-frame', title: basename(ctx.path) });
  el.append(frame);
  let url = null;

  return {
    async load(file) {
      const blob = file.type === 'application/pdf' ? file : new Blob([file], { type: 'application/pdf' });
      const next = URL.createObjectURL(blob);
      frame.src = next;
      if (url) URL.revokeObjectURL(url);
      url = next;
    },
    getViewState: () => null, // the built-in viewer keeps its own page/zoom while the tab stays loaded
    setViewState() {},
    destroy() {
      frame.src = 'about:blank';
      frame.remove();
      if (url) URL.revokeObjectURL(url);
      url = null;
    },
  };
}

export default { create, capabilities: { edit: false } };
