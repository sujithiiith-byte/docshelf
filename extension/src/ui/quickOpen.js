// Ctrl+P: fuzzy "go to document" picker.

import { h, dirname } from '../util.js';

const MAX_RESULTS = 60;

/** Subsequence match with bonuses for consecutive letters, word starts and the file name. */
function score(query, path) {
  const lower = path.toLowerCase();
  const nameStart = path.lastIndexOf('/') + 1;
  let qi = 0;
  let s = 0;
  let prev = -2;
  for (let i = 0; i < lower.length && qi < query.length; i++) {
    if (lower[i] !== query[qi]) continue;
    s += 1;
    if (i === prev + 1) s += 4;
    if (i >= nameStart) s += 2;
    if (i === 0 || '/-_. '.includes(lower[i - 1])) s += 3;
    prev = i;
    qi++;
  }
  return qi < query.length ? -1 : s - path.length * 0.01;
}

export class QuickOpen {
  constructor({ getFiles, getRecent, onOpen }) {
    this.getFiles = getFiles;
    this.getRecent = getRecent;
    this.onOpen = onOpen;
    this.items = [];
    this.selected = 0;
    this.input = h('input', { type: 'text', placeholder: 'Go to document by name…', spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Go to document' });
    this.list = h('div', { class: 'qo-list', role: 'listbox' });
    this.box = h('div', { class: 'qo-box', role: 'dialog', 'aria-label': 'Go to document' }, this.input, this.list);
    this.overlay = h('div', { class: 'qo-overlay', hidden: true }, this.box);
    document.body.append(this.overlay);

    this.input.addEventListener('input', () => this.#update());
    this.input.addEventListener('keydown', (e) => this.#onKey(e));
    this.overlay.addEventListener('pointerdown', (e) => { if (e.target === this.overlay) this.close(); });
    this.list.addEventListener('click', (e) => {
      const item = e.target.closest('.qo-item');
      if (item) this.#choose(Number(item.dataset.i));
    });
    this.list.addEventListener('pointermove', (e) => {
      const item = e.target.closest('.qo-item');
      if (item) this.#select(Number(item.dataset.i), false);
    });
  }

  get isOpen() {
    return !this.overlay.hidden;
  }

  open() {
    this.overlay.hidden = false;
    this.input.value = '';
    this.#update();
    this.input.focus();
  }

  close() {
    this.overlay.hidden = true;
  }

  #update() {
    const q = this.input.value.toLowerCase().replace(/\s+/g, '');
    const files = this.getFiles();
    if (!q) {
      // Recently used documents first, then everything else by path.
      const recent = this.getRecent().filter((p) => files.some((f) => f.path === p));
      const rest = files.map((f) => f.path).filter((p) => !recent.includes(p));
      this.items = [...recent, ...rest].slice(0, MAX_RESULTS).map((path) => ({ path, type: files.find((f) => f.path === path)?.type }));
    } else {
      this.items = files
        .map((f) => ({ path: f.path, type: f.type, s: score(q, f.path) }))
        .filter((x) => x.s >= 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, MAX_RESULTS);
    }
    this.list.replaceChildren(...this.items.map((it, i) => {
      const name = it.path.slice(it.path.lastIndexOf('/') + 1);
      return h('div', { class: `qo-item type-${it.type}`, role: 'option', 'data-i': i },
        h('span', { class: 'ficon' }), h('span', { class: 'label', text: name }), h('span', { class: 'hit-dir', text: dirname(it.path) }));
    }));
    if (!this.items.length) this.list.append(h('div', { class: 'qo-empty', text: files.length ? 'No matching documents' : 'Open a folder first' }));
    this.#select(0);
  }

  #select(i, scroll = true) {
    this.selected = Math.max(0, Math.min(i, this.items.length - 1));
    this.list.querySelectorAll('.qo-item').forEach((el, j) => {
      el.classList.toggle('selected', j === this.selected);
      el.setAttribute('aria-selected', String(j === this.selected));
      if (j === this.selected && scroll) el.scrollIntoView({ block: 'nearest' });
    });
  }

  #choose(i) {
    const it = this.items[i];
    if (!it) return;
    this.close();
    this.onOpen(it.path, { pin: true }); // a deliberate pick: keep it open
  }

  #onKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); this.#select(this.selected + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); this.#select(this.selected - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); this.#choose(this.selected); }
    else if (e.key === 'Escape') { e.preventDefault(); this.close(); }
  }
}
