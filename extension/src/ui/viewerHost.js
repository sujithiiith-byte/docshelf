// Owns the document views in the main area.
//  - One view per tab; only the active one is shown.
//  - Only MAX_LIVE views stay rendered; older ones are unloaded to save memory
//    and re-rendered (at the same scroll position) when you come back to them.
//  - The active document is re-read when the file changes on disk.
//
// Viewer contract (see src/viewers/*):
//   create(el, { path, workspace }) -> {
//     load(file): Promise   render (or re-render) the File
//     getViewState() / setViewState(state)   e.g. scroll position
//     reveal?(fragment)     jump to an in-document anchor
//     toolbar?: HTMLElement extra buttons shown in the path bar
//     destroy()
//   }
// A future edit mode adds e.g. enterEdit()/save() to a viewer and sets tab.dirty;
// nothing here needs to change except skipping auto-reload while dirty.

import { loadViewer } from '../viewers/registry.js';
import { h } from '../util.js';

const MAX_LIVE = 4;
const POLL_MS = 1500;

export class ViewerHost {
  #views = new Map(); // tabId -> view record
  #activeId = null;
  #noteTimer;

  constructor({ viewsEl, barEl, workspace }) {
    this.viewsEl = viewsEl;
    this.ws = workspace;
    this.crumbs = h('div', { class: 'crumbs', title: 'Show in explorer' });
    this.note = h('span', { class: 'bar-note' });
    this.actions = h('div', { class: 'bar-actions' });
    barEl.append(this.crumbs, this.note, this.actions);
    this.crumbs.addEventListener('click', () => {
      const v = this.#views.get(this.#activeId);
      if (v) this.ws.reveal(v.tab.path);
    });
    setInterval(() => this.#checkForChanges(), POLL_MS);
    document.addEventListener('visibilitychange', () => this.#checkForChanges());
  }

  /** Bring the views in line with the tab list. Called on every tab change. */
  sync(tabs, active) {
    const ids = new Set(tabs.map((t) => t.id));
    for (const [id, v] of this.#views) {
      if (!ids.has(id)) this.#destroy(v);
      else v.tab = tabs.find((t) => t.id === id);
    }

    const nextId = active?.id ?? null;
    const prev = this.#views.get(this.#activeId);
    const switching = this.#activeId !== nextId;
    if (prev && switching) {
      this.#saveState(prev);
      prev.el.hidden = true;
    }
    if (switching) this.note.textContent = '';
    this.#activeId = nextId;
    if (!active) {
      this.#renderBar(null);
      return;
    }

    let v = this.#views.get(active.id);
    if (!v) {
      v = { tab: active, el: h('div', { class: `view view-${active.type}`, role: 'tabpanel' }), inst: null, state: null };
      this.viewsEl.append(v.el);
      this.#views.set(active.id, v);
    }
    v.lastUsed = performance.now();
    v.el.hidden = false;
    if (v.inst) {
      if (switching) v.inst.setViewState(v.state); // also lets the view refresh layout-dependent bits
    } else if (!v.mounting) {
      v.mounting = this.#mount(v);
    }
    this.#renderBar(v);
    this.#evict();
  }

  /** Jump to #fragment in a tab's document (now, or once it has loaded). */
  revealFragment(tabId, fragment) {
    const v = this.#views.get(tabId);
    if (!v) return;
    if (v.inst) v.inst.reveal?.(fragment);
    else v.fragment = fragment;
  }

  /** Highlight `query` in a tab's document and scroll to match number `index`. */
  find(tabId, query, index = 0) {
    const v = this.#views.get(tabId);
    if (!v) return;
    if (v.inst) v.inst.find?.(query, index);
    else v.pendingFind = { query, index };
  }

  async #mount(v) {
    const { tab } = v;
    v.el.replaceChildren(h('div', { class: 'view-msg loading', text: 'Loading…' }));
    try {
      const handle = await this.ws.getFileHandle(tab.path);
      const file = await handle.getFile();
      const viewer = await loadViewer(tab.type);
      if (v.destroyed) return;
      v.el.replaceChildren();
      const inst = viewer.create(v.el, { path: tab.path, workspace: this.ws });
      await inst.load(file);
      if (v.destroyed) { inst.destroy(); return; }
      Object.assign(v, { inst, handle, mtime: file.lastModified, size: file.size, missing: false });
      if (v.state) inst.setViewState(v.state);
      if (v.fragment) { inst.reveal?.(v.fragment); v.fragment = null; }
      if (v.pendingFind) { inst.find?.(v.pendingFind.query, v.pendingFind.index); v.pendingFind = null; }
      if (tab.id === this.#activeId) this.#renderBar(v);
    } catch (err) {
      if (!v.destroyed) v.el.replaceChildren(this.#errorView(v, err));
    } finally {
      v.mounting = null;
    }
  }

  #errorView(v, err) {
    const notFound = err?.name === 'NotFoundError';
    return h(
      'div',
      { class: 'view-msg error' },
      h('strong', { text: notFound ? `“${v.tab.name}” no longer exists` : `Couldn't open “${v.tab.name}”` }),
      h('div', { text: notFound ? 'It may have been moved, renamed or deleted.' : String(err?.message ?? err) }),
      h('button', { class: 'btn', text: 'Try again', onclick: () => { if (!v.mounting) v.mounting = this.#mount(v); } }),
    );
  }

  #saveState(v) {
    if (v.inst) v.state = v.inst.getViewState?.() ?? null;
  }

  #evict() {
    const idle = [...this.#views.values()]
      .filter((v) => v.inst && v.tab.id !== this.#activeId)
      .sort((a, b) => b.lastUsed - a.lastUsed);
    for (const v of idle.slice(MAX_LIVE - 1)) {
      this.#saveState(v);
      v.inst.destroy();
      v.inst = null;
      v.el.replaceChildren();
    }
  }

  #destroy(v) {
    v.destroyed = true;
    v.inst?.destroy();
    v.el.remove();
    this.#views.delete(v.tab.id);
  }

  #renderBar(v) {
    if (!v) {
      this.crumbs.replaceChildren();
      this.actions.replaceChildren();
      return;
    }
    const parts = [this.ws.rootName, ...v.tab.path.split('/')];
    const nodes = [];
    parts.forEach((p, i) => {
      if (i) nodes.push(h('span', { class: 'sep', text: '›' }));
      nodes.push(h('span', { class: i === parts.length - 1 ? 'leaf' : null, text: p }));
    });
    this.crumbs.replaceChildren(...nodes);
    // PDFs have their own print button inside Chrome's viewer.
    const print = v.inst && v.tab.type !== 'pdf'
      ? h('button', { class: 'tb-btn', text: 'Print', title: 'Print or save as PDF', onclick: () => window.print() })
      : null;
    this.actions.replaceChildren(v.inst?.toolbar ?? '', print ?? '');
  }

  #flash(text) {
    this.note.textContent = text;
    clearTimeout(this.#noteTimer);
    this.#noteTimer = setTimeout(() => { this.note.textContent = ''; }, 2500);
  }

  /** Cheap: one getFile() on the active document only, and only while the page is visible. */
  async #checkForChanges() {
    if (document.hidden) return;
    const v = this.#views.get(this.#activeId);
    if (!v?.inst || v.checking || v.mounting || v.tab.dirty) return;
    v.checking = true;
    try {
      let file;
      try {
        file = await v.handle.getFile();
      } catch {
        v.handle = await this.ws.getFileHandle(v.tab.path); // re-resolve once (e.g. after a rescan)
        file = await v.handle.getFile();
      }
      v.missing = false;
      if (file.lastModified !== v.mtime || file.size !== v.size) {
        v.mtime = file.lastModified;
        v.size = file.size;
        const state = v.inst.getViewState?.();
        await v.inst.load(file);
        if (state) v.inst.setViewState(state);
        if (v.tab.id === this.#activeId) this.#flash('Updated from disk');
      }
    } catch (err) {
      if (err?.name === 'NotFoundError' && !v.missing) {
        v.missing = true;
        this.#flash('File was moved or deleted');
      }
    } finally {
      v.checking = false;
    }
  }
}
