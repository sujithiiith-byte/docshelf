// Sidebar "Search in documents" panel (Ctrl+Shift+F).

import { h, dirname, debounce } from '../util.js';
import { SearchEngine } from '../search/searchEngine.js';
import { clearHighlights } from '../viewers/highlight.js';

export class SearchPanel {
  #engine = new SearchEngine();
  #token = 0;
  #query = '';

  constructor(el, { getNodes, onOpen }) {
    this.getNodes = getNodes;
    this.onOpen = onOpen;
    this.input = h('input', {
      type: 'search',
      placeholder: 'Search in Markdown & text files',
      spellcheck: 'false',
      autocomplete: 'off',
      'aria-label': 'Search in documents',
    });
    this.status = h('div', { class: 'search-status' });
    this.results = h('div', { class: 'search-results', role: 'list' });
    el.append(h('div', { class: 'search' }, this.input), this.status, this.results);

    this.input.addEventListener('input', debounce(() => this.run(), 200));
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.run(true); }
      if (e.key === 'ArrowDown') { e.preventDefault(); this.results.querySelector('.hit')?.focus(); }
    });
    this.results.addEventListener('click', (e) => this.#onHit(e, false));
    this.results.addEventListener('dblclick', (e) => this.#onHit(e, true));
    this.results.addEventListener('keydown', (e) => {
      const hits = [...this.results.querySelectorAll('.hit')];
      const i = hits.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); hits[Math.min(i + 1, hits.length - 1)]?.focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); (i <= 0 ? this.input : hits[i - 1]).focus(); }
      else if (e.key === 'Enter' && i >= 0) { e.preventDefault(); this.#open(hits[i], e.ctrlKey || e.metaKey); }
    });
  }

  focus() {
    this.input.focus();
    this.input.select();
  }

  /** Forget cached file contents (e.g. a different folder was opened). */
  reset() {
    this.#engine.clear();
    this.#token++;
    this.#query = '';
    this.input.value = '';
    this.status.textContent = '';
    this.results.replaceChildren();
    clearHighlights();
  }

  async run(force = false) {
    const query = this.input.value.trim();
    if (query === this.#query && !force) return;
    this.#query = query;
    const token = ++this.#token;
    this.results.replaceChildren();
    clearHighlights();
    if (query.length < 2) {
      this.status.textContent = query ? 'Type at least 2 characters.' : '';
      return;
    }
    this.status.textContent = 'Searching…';
    const groups = [];
    const flush = debounce(() => { if (token === this.#token) this.#render(groups, query); }, 60);
    const summary = await this.#engine.search(this.getNodes(), query, {
      isCancelled: () => token !== this.#token,
      onFile: (g) => { groups.push(g); flush(); },
    });
    if (token !== this.#token) return;
    this.#render(groups, query);
    const { files, matches, limited } = summary;
    this.status.textContent = matches
      ? `${matches}${limited ? '+' : ''} match${matches === 1 ? '' : 'es'} in ${files} file${files === 1 ? '' : 's'}`
      : 'No matches. (PDF text is not searched.)';
  }

  #render(groups, query) {
    groups.sort((a, b) => a.node.path.localeCompare(b.node.path));
    this.results.replaceChildren(...groups.map(({ node, matches, truncated }) =>
      h('div', { class: 'hit-group', role: 'listitem' },
        h('div', { class: `hit-file type-${node.type}`, title: node.path },
          h('span', { class: 'ficon' }),
          h('span', { class: 'label', text: node.name }),
          h('span', { class: 'hit-dir', text: dirname(node.path) }),
          h('span', { class: 'count', text: `${matches.length}${truncated ? '+' : ''}` })),
        matches.map((m) => h('div', {
          class: 'hit',
          tabindex: '-1',
          'data-path': node.path,
          'data-occurrence': m.occurrence,
          'data-query': query,
          title: `Line ${m.line}`,
        },
        m.preview.slice(0, m.start),
        h('mark', { text: m.preview.slice(m.start, m.end) }),
        m.preview.slice(m.end))))));
  }

  #onHit(e, pin) {
    const hit = e.target.closest('.hit');
    if (hit) this.#open(hit, pin || e.ctrlKey || e.metaKey);
  }

  #open(hit, pin) {
    this.results.querySelector('.hit.selected')?.classList.remove('selected');
    hit.classList.add('selected');
    this.onOpen(hit.dataset.path, { pin, find: { query: hit.dataset.query, index: Number(hit.dataset.occurrence) } });
  }
}
