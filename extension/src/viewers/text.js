// Plain-text viewer: monospace by default, or a readable "prose" mode.

import { h, store, toggleButton, formatSize } from '../util.js';
import { highlightText, scrollRangeIntoView } from './highlight.js';

const MAX_BYTES = 20 * 1024 * 1024; // show at most the first 20 MB

const root = document.documentElement;
root.classList.toggle('txt-prose', store.get('txt.prose', false));

function create(el) {
  el.classList.add('text-host');
  const note = h('div', { class: 'text-note', hidden: true });
  const pre = h('pre', { class: 'text-view' });
  el.append(note, pre);

  const toolbar = toggleButton('Prose', 'Use a readable proportional font', root.classList.contains('txt-prose'), (on) => {
    store.set('txt.prose', on);
    root.classList.toggle('txt-prose', on);
  });

  return {
    toolbar,
    async load(file) {
      const truncated = file.size > MAX_BYTES;
      let text = await (truncated ? file.slice(0, MAX_BYTES) : file).text();
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
      pre.textContent = text;
      note.hidden = !truncated;
      note.textContent = truncated ? `Large file: showing the first 20 MB of ${formatSize(file.size)}.` : '';
    },
    find(query, index = 0) {
      const range = highlightText(pre, query, index);
      if (range) scrollRangeIntoView(el, range);
      return !!range;
    },
    getViewState: () => ({ scrollTop: el.scrollTop }),
    setViewState(state) {
      if (state) el.scrollTop = state.scrollTop;
    },
    destroy() {
      el.replaceChildren();
    },
  };
}

export default { create, capabilities: { edit: false } };
