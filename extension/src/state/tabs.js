// Tab state, independent of any UI. VS Code semantics:
//  - at most one *preview* tab (pinned=false); opening another file in preview
//    replaces it in place
//  - pinned tabs stay until closed
// `dirty` is reserved for a future edit mode (a dirty preview tab must be pinned
// before it can be replaced).

import { Emitter } from './emitter.js';
import { basename } from '../util.js';
import { typeOf } from '../fs/types.js';

let seq = 0;
const makeTab = (path, pinned) => ({
  id: `t${++seq}`,
  path,
  name: basename(path),
  type: typeOf(basename(path)),
  pinned: !!pinned,
  dirty: false,
});

export class TabStore extends Emitter {
  tabs = [];
  activeId = null;
  #mru = []; // most-recently-used tab ids, for picking the next tab on close

  get active() {
    return this.get(this.activeId);
  }

  get(id) {
    return this.tabs.find((t) => t.id === id) ?? null;
  }

  open(path, { pin = false } = {}) {
    let tab = this.tabs.find((t) => t.path === path);
    if (tab) {
      if (pin) tab.pinned = true;
    } else {
      tab = makeTab(path, pin);
      const previewIndex = pin ? -1 : this.tabs.findIndex((t) => !t.pinned && !t.dirty);
      if (previewIndex >= 0) {
        this.#forget(this.tabs[previewIndex].id);
        this.tabs[previewIndex] = tab;
      } else {
        const activeIndex = this.tabs.findIndex((t) => t.id === this.activeId);
        this.tabs.splice(activeIndex < 0 ? this.tabs.length : activeIndex + 1, 0, tab);
      }
    }
    this.#setActive(tab.id);
    this.emit('change');
    return tab;
  }

  pin(id) {
    const tab = this.get(id);
    if (tab && !tab.pinned) {
      tab.pinned = true;
      this.emit('change');
    }
  }

  activate(id) {
    if (this.get(id) && this.activeId !== id) {
      this.#setActive(id);
      this.emit('change');
    }
  }

  close(id) {
    const index = this.tabs.findIndex((t) => t.id === id);
    if (index < 0) return;
    this.tabs.splice(index, 1);
    this.#forget(id);
    if (this.activeId === id) {
      this.activeId = null;
      const next = this.#mru.find((x) => this.get(x)) ?? this.tabs[Math.min(index, this.tabs.length - 1)]?.id;
      if (next) this.#setActive(next);
    }
    this.emit('change');
  }

  /** Close several tabs at once: 'others' | 'right' | 'all' relative to tab `id`. */
  closeMany(id, which) {
    const index = this.tabs.findIndex((t) => t.id === id);
    const keep = (t, i) => (which === 'others' ? t.id === id : which === 'right' ? i <= index : false);
    const removed = this.tabs.filter((t, i) => !keep(t, i));
    if (!removed.length) return;
    this.tabs = this.tabs.filter((t, i) => keep(t, i));
    removed.forEach((t) => this.#forget(t.id));
    if (!this.get(this.activeId)) {
      this.activeId = null;
      const next = this.#mru.find((x) => this.get(x)) ?? this.tabs.at(-1)?.id;
      if (next) this.#setActive(next);
    }
    this.emit('change');
  }

  /** dir = +1 (next) or -1 (previous), wrapping around. */
  cycle(dir) {
    if (this.tabs.length < 2) return;
    const i = this.tabs.findIndex((t) => t.id === this.activeId);
    this.activate(this.tabs[(i + dir + this.tabs.length) % this.tabs.length].id);
  }

  reset() {
    this.tabs = [];
    this.activeId = null;
    this.#mru = [];
    this.emit('change');
  }

  serialize() {
    return {
      tabs: this.tabs.map((t) => ({ path: t.path, pinned: t.pinned })),
      active: this.active?.path ?? null,
    };
  }

  restore(saved, exists) {
    if (!saved?.tabs?.length) return;
    let previewTaken = false;
    for (const s of saved.tabs) {
      if (!exists(s.path) || this.tabs.some((t) => t.path === s.path)) continue;
      const pinned = s.pinned || previewTaken; // keep the "only one preview" rule
      if (!pinned) previewTaken = true;
      this.tabs.push(makeTab(s.path, pinned));
    }
    const active = this.tabs.find((t) => t.path === saved.active) ?? this.tabs.at(-1);
    if (active) this.#setActive(active.id);
    this.emit('change');
  }

  #setActive(id) {
    this.activeId = id;
    this.#mru = [id, ...this.#mru.filter((x) => x !== id)];
  }

  #forget(id) {
    this.#mru = this.#mru.filter((x) => x !== id);
  }
}
