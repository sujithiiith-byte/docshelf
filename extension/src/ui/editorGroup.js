// One editor group = a tab strip, a path bar and the document views.
// The workspace shows one group, or two side by side when split.

import { h } from '../util.js';
import { TabStore } from '../state/tabs.js';
import { TabBar } from './tabbar.js';
import { ViewerHost } from './viewerHost.js';

export class EditorGroup {
  constructor({ workspace, onFocus, onSplit }) {
    this.tabs = new TabStore();
    const tabbarEl = h('div', { class: 'tabbar', role: 'tablist', 'aria-label': 'Open documents' });
    const pathbarEl = h('div', { class: 'pathbar' });
    const viewsEl = h('div', { class: 'views' });
    this.el = h('section', { class: 'group' }, tabbarEl, pathbarEl, viewsEl);
    this.tabbar = new TabBar(tabbarEl, this.tabs);
    this.host = new ViewerHost({ viewsEl, barEl: pathbarEl, workspace, onSplit });
    this.tabs.on('change', () => {
      this.host.sync(this.tabs.tabs, this.tabs.active);
      this.#record();
    });
    // Any interaction inside the group makes it the one new documents open in.
    this.el.addEventListener('pointerdown', () => onFocus(this), true);
    this.el.addEventListener('focusin', () => onFocus(this));
  }

  // Back/forward history of the documents shown in this group (like a browser).
  history = [];
  historyPos = -1;
  navigating = false;

  #record() {
    const path = this.tabs.active?.path;
    if (!path || this.navigating || path === this.history[this.historyPos]) return;
    this.history.splice(this.historyPos + 1, Infinity, path);
    if (this.history.length > 50) this.history.shift();
    this.historyPos = this.history.length - 1;
  }

  /** Move `dir` (-1 back, +1 forward) through the history; returns the path to show, or null. */
  step(dir) {
    const here = this.tabs.active?.path;
    let i = this.historyPos + dir;
    while (this.history[i] != null && this.history[i] === here) i += dir;
    if (this.history[i] == null) return null;
    this.historyPos = i;
    return this.history[i];
  }

  dispose() {
    this.host.dispose();
    this.el.remove();
  }
}
