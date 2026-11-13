// Left sidebar tree. Renders a flat list of rows for the folders that are
// expanded, and hides any folder with no file matching the active filters.

import { h, dirname } from '../util.js';

export class Explorer {
  constructor(el, { filters, onOpen, onExpandChange }) {
    this.el = el;
    this.filters = filters;
    this.onOpen = onOpen;
    this.onExpandChange = onExpandChange;
    this.root = null;
    this.expanded = new Set();
    this.activePath = null;
    this.focusPath = null;
    this.rows = []; // visible row paths, in order
    this.nodes = new Map(); // path -> node, for visible rows
    this.visibleCount = 0;

    el.addEventListener('click', (e) => this.#onClick(e));
    el.addEventListener('dblclick', (e) => {
      const row = e.target.closest('.row.file');
      if (row) this.onOpen(row.dataset.path, { pin: true });
    });
    el.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); }); // no autoscroll
    el.addEventListener('auxclick', (e) => {
      const row = e.button === 1 && e.target.closest('.row.file');
      if (row) this.onOpen(row.dataset.path, { pin: true });
    });
    el.addEventListener('keydown', (e) => this.#onKey(e));
  }

  setExpanded(paths) {
    this.expanded = new Set(paths ?? []);
  }

  setTree(root) {
    this.root = root;
    this.render();
  }

  clear(message = '') {
    this.root = null;
    this.rows = [];
    this.nodes.clear();
    this.el.replaceChildren(message ? h('div', { class: 'tree-msg', text: message }) : '');
  }

  showMessage(message) {
    this.el.replaceChildren(h('div', { class: 'tree-msg', text: message }));
  }

  /** Map of path -> number of matching files below it (dirs) or 1 (files). */
  #computeVisible() {
    const visible = new Map();
    const walk = (dir) => {
      let n = 0;
      for (const c of dir.children) {
        if (c.kind === 'file') {
          if (this.filters.matches(c)) { visible.set(c.path, 1); n++; }
        } else {
          const k = walk(c);
          if (k) { visible.set(c.path, k); n += k; }
        }
      }
      return n;
    };
    this.visibleCount = walk(this.root);
    return visible;
  }

  render() {
    if (!this.root) return;
    const visible = this.#computeVisible();
    const forceOpen = !!this.filters.query; // while searching, show every match
    const frag = document.createDocumentFragment();
    this.rows = [];
    this.nodes.clear();

    const walk = (dir, depth) => {
      for (const node of dir.children) {
        if (!visible.has(node.path)) continue;
        const open = node.kind === 'dir' && (forceOpen || this.expanded.has(node.path));
        this.rows.push(node.path);
        this.nodes.set(node.path, node);
        frag.append(this.#row(node, depth, open, visible.get(node.path)));
        if (open) walk(node, depth + 1);
      }
    };
    walk(this.root, 0);

    if (!this.rows.length) {
      const msg = this.root.children.length
        ? 'No documents match the current filters.'
        : 'No Markdown, PDF or text files in this folder.';
      frag.append(h('div', { class: 'tree-msg', text: msg }));
    }
    this.el.replaceChildren(frag);
  }

  #row(node, depth, open, count) {
    const isDir = node.kind === 'dir';
    const cls = ['row', isDir ? 'dir' : `file type-${node.type}`];
    if (node.path === this.activePath) cls.push('active');
    if (node.path === this.focusPath) cls.push('focused');
    const row = h(
      'div',
      {
        class: cls.join(' '),
        role: 'treeitem',
        'data-path': node.path,
        title: node.path,
        'aria-level': depth + 1,
        'aria-expanded': isDir ? String(open) : null,
        'aria-selected': String(node.path === this.activePath),
      },
      h('span', { class: 'twisty' }),
      h('span', { class: 'ficon' }),
      h('span', { class: 'label', text: node.name }),
      isDir ? h('span', { class: 'count', text: String(count) }) : null,
    );
    row.style.setProperty('--depth', depth);
    return row;
  }

  #rowEl(path) {
    return path == null ? null : this.el.querySelector(`.row[data-path="${CSS.escape(path)}"]`);
  }

  toggle(path, open = !this.expanded.has(path)) {
    if (open) this.expanded.add(path);
    else this.expanded.delete(path);
    this.render();
    this.onExpandChange?.();
  }

  collapseAll() {
    this.expanded.clear();
    this.render();
    this.onExpandChange?.();
  }

  /** Highlight the file shown in the active tab and make sure it's visible. */
  setActive(path) {
    if (path === this.activePath) return;
    this.#rowEl(this.activePath)?.classList.remove('active');
    this.activePath = path;
    if (path) this.reveal(path);
  }

  reveal(path) {
    if (!this.root) return;
    let changed = false;
    for (let dir = dirname(path); dir; dir = dirname(dir)) {
      if (!this.expanded.has(dir)) { this.expanded.add(dir); changed = true; }
    }
    if (changed) {
      this.render();
      this.onExpandChange?.();
    }
    const row = this.#rowEl(path);
    if (row) {
      row.classList.toggle('active', path === this.activePath);
      row.scrollIntoView({ block: 'nearest' });
    }
  }

  #setFocus(path) {
    this.#rowEl(this.focusPath)?.classList.remove('focused');
    this.focusPath = path;
    const row = this.#rowEl(path);
    row?.classList.add('focused');
    row?.scrollIntoView({ block: 'nearest' });
  }

  #onClick(e) {
    const row = e.target.closest('.row');
    if (!row) return;
    const path = row.dataset.path;
    this.#setFocus(path);
    if (row.classList.contains('dir')) this.toggle(path);
    else this.onOpen(path, { pin: e.ctrlKey || e.metaKey });
  }

  #onKey(e) {
    if (!this.rows.length) return;
    const i = this.rows.indexOf(this.focusPath);
    const node = this.nodes.get(this.focusPath);
    const move = (to) => {
      e.preventDefault();
      this.#setFocus(this.rows[Math.max(0, Math.min(this.rows.length - 1, to))]);
    };
    switch (e.key) {
      case 'ArrowDown': return move(i + 1);
      case 'ArrowUp': return move(i < 0 ? 0 : i - 1);
      case 'Home': return move(0);
      case 'End': return move(this.rows.length - 1);
      case 'ArrowRight':
        if (node?.kind === 'dir') {
          e.preventDefault();
          if (!this.expanded.has(node.path)) this.toggle(node.path, true);
          else move(i + 1);
        }
        return;
      case 'ArrowLeft':
        if (!node) return;
        e.preventDefault();
        if (node.kind === 'dir' && this.expanded.has(node.path)) this.toggle(node.path, false);
        else if (dirname(node.path)) this.#setFocus(dirname(node.path));
        return;
      case 'Enter':
      case ' ':
        if (!node) return;
        e.preventDefault();
        if (node.kind === 'dir') this.toggle(node.path);
        else this.onOpen(node.path, { pin: e.key === 'Enter' });
        return;
      default:
    }
  }
}
