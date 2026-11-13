// The tab strip. Pure view of TabStore: click = switch, double-click = keep open,
// middle-click or × = close, mouse wheel scrolls horizontally.

import { h, dirname } from '../util.js';
import { ICONS } from './icons.js';

export class TabBar {
  constructor(el, tabs) {
    this.el = el;
    this.tabs = tabs;
    tabs.on('change', () => this.render());

    el.addEventListener('click', (e) => {
      const tab = e.target.closest('.tab');
      if (!tab) return;
      if (e.target.closest('.close')) tabs.close(tab.dataset.id);
      else tabs.activate(tab.dataset.id);
    });
    el.addEventListener('dblclick', (e) => {
      const tab = e.target.closest('.tab');
      if (tab && !e.target.closest('.close')) tabs.pin(tab.dataset.id);
    });
    el.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });
    el.addEventListener('auxclick', (e) => {
      const tab = e.button === 1 && e.target.closest('.tab');
      if (tab) tabs.close(tab.dataset.id);
    });
    el.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        el.scrollLeft += e.deltaY;
        e.preventDefault();
      }
    }, { passive: false });
  }

  render() {
    const { tabs, activeId } = this.tabs;
    const nameCount = new Map();
    for (const t of tabs) nameCount.set(t.name, (nameCount.get(t.name) ?? 0) + 1);

    this.el.replaceChildren(...tabs.map((t) => {
      const active = t.id === activeId;
      const cls = ['tab', `type-${t.type}`];
      if (!t.pinned) cls.push('preview');
      if (active) cls.push('active');
      return h(
        'div',
        {
          class: cls.join(' '),
          role: 'tab',
          'aria-selected': String(active),
          'data-id': t.id,
          title: t.pinned ? t.path : `${t.path}\nPreview: double-click to keep it open`,
        },
        h('span', { class: 'ficon' }),
        h('span', { class: 'title', text: t.name }),
        nameCount.get(t.name) > 1 ? h('span', { class: 'desc', text: dirname(t.path) || '/' }) : null,
        h('button', { class: 'close', title: 'Close (Alt+W)', 'aria-label': `Close ${t.name}`, html: ICONS.close }),
      );
    }));

    // Keep the active tab in view without scrolling anything else on the page.
    const activeEl = this.el.querySelector('.tab.active');
    if (activeEl) {
      const left = activeEl.offsetLeft;
      const right = left + activeEl.offsetWidth;
      if (left < this.el.scrollLeft) this.el.scrollLeft = left;
      else if (right > this.el.scrollLeft + this.el.clientWidth) this.el.scrollLeft = right - this.el.clientWidth;
    }
  }
}
