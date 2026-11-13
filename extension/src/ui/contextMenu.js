// A small right-click menu. items: [{ label, action, disabled?, hint? } | 'sep']

import { h } from '../util.js';

let current = null;

export function closeMenu() {
  current?.remove();
  current = null;
}

export function showMenu(x, y, items) {
  closeMenu();
  const buttons = [];
  const menu = h('div', { class: 'ctx-menu', role: 'menu' }, items.map((item) => {
    if (item === 'sep') return h('div', { class: 'ctx-sep', role: 'separator' });
    const btn = h('button', { class: 'ctx-item', role: 'menuitem', disabled: item.disabled },
      h('span', { text: item.label }), item.hint ? h('kbd', { text: item.hint }) : null);
    btn.addEventListener('click', () => { closeMenu(); item.action(); });
    buttons.push(btn);
    return btn;
  }));
  document.body.append(menu);
  current = menu;

  // Keep the menu on screen.
  const r = menu.getBoundingClientRect();
  menu.style.left = `${Math.min(x, window.innerWidth - r.width - 4)}px`;
  menu.style.top = `${Math.min(y, window.innerHeight - r.height - 4)}px`;

  const enabled = buttons.filter((b) => !b.disabled);
  enabled[0]?.focus();
  menu.addEventListener('keydown', (e) => {
    const i = enabled.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); enabled[(i + 1) % enabled.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); enabled[(i - 1 + enabled.length) % enabled.length]?.focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); closeMenu(); }
  });
}

// Any click elsewhere, scroll, resize or tab switch closes the menu.
for (const ev of ['pointerdown', 'wheel']) {
  window.addEventListener(ev, (e) => { if (current && !current.contains(e.target)) closeMenu(); }, true);
}
window.addEventListener('resize', closeMenu);
window.addEventListener('blur', closeMenu);
