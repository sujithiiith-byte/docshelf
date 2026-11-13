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
    this.tabs.on('change', () => this.host.sync(this.tabs.tabs, this.tabs.active));
    // Any interaction inside the group makes it the one new documents open in.
    this.el.addEventListener('pointerdown', () => onFocus(this), true);
    this.el.addEventListener('focusin', () => onFocus(this));
  }

  dispose() {
    this.host.dispose();
    this.el.remove();
  }
}
