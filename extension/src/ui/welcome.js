// Shown in the main area when no document is open.

import { h } from '../util.js';
import { ICONS } from './icons.js';

// The essentials are shown; the rest fold away so the page stays calm.
const SHORTCUTS = [
  ['Click', 'Preview a document'],
  ['Double-click', 'Keep it open in its own tab'],
  ['Ctrl+P', 'Go to a document by name'],
  ['Ctrl+Shift+F', 'Search inside all documents'],
  ['Alt+W', 'Close tab'],
];
const MORE_SHORTCUTS = [
  ['Ctrl+click / middle-click', 'Open straight into its own tab'],
  ['Right-click', 'Tab and file actions'],
  ['Ctrl+\\ / Alt+click', 'Open to the side (split view)'],
  ['Alt+[ / Alt+]', 'Previous / next tab'],
  ['Alt+P', 'Keep the preview tab open'],
  ['/', 'Filter files by name'],
  ['Ctrl+B', 'Hide / show the sidebar'],
  ['Ctrl+O', 'Open another folder'],
  ['Alt+Shift+D', 'Open DocShelf from anywhere in Chrome'],
];

export function renderWelcome(el, { rootName, recents, currentId, openElsewhere, suggested, unsupported, onPick, onOpenRecent, onForget }) {
  const lead = rootName
    ? `Pick a document from “${rootName}” in the sidebar.`
    : 'Read your Markdown, PDF and text documents in tabs. Everything stays on your computer.';

  const recentItems = recents.map((r) => {
    const here = r.id === currentId;
    const elsewhere = !here && openElsewhere.has(r.id);
    return h(
      'li',
      null,
      h('button', {
        class: `recent-open${here ? ' current' : ''}${elsewhere ? ' elsewhere' : ''}`,
        text: r.name,
        title: here ? 'Open in this tab' : elsewhere ? 'Open in another tab: click to switch to it' : `Open “${r.name}” in this tab`,
        onclick: () => onOpenRecent(r),
      }),
      h('button', {
        class: 'icon-btn',
        title: 'Remove from list',
        'aria-label': `Remove ${r.name} from recent folders`,
        html: ICONS.close,
        onclick: () => onForget(r),
      }),
    );
  });

  // Chrome asks for folder permission again in each new browser session, so
  // the most common action is "reopen what I had": make that the big button.
  const last = !rootName && suggested;
  const pickBtn = h('button', {
    class: `btn${last ? '' : ' primary'}`,
    onclick: onPick,
    html: `${ICONS.folder}<span>${rootName ? 'Open another folder…' : 'Open folder…'}</span>`,
  });
  const actions = unsupported
    ? h('p', { class: 'warn', text: 'This browser does not allow folder access (File System Access API). Use Chrome or Edge. In Brave, enable brave://flags/#file-system-access-api.' })
    : h(
      'div',
      { class: 'welcome-actions' },
      last ? h('button', { class: 'btn primary', onclick: () => onOpenRecent(last), text: `Reopen “${last.name}”` }) : null,
      pickBtn,
    );

  el.replaceChildren(
    h(
      'div',
      { class: 'welcome-inner' },
      h('div', { class: 'brand' }, h('img', { src: 'icons/icon48.png', alt: '' }), h('h1', { text: 'DocShelf' })),
      h('p', { class: 'lead', text: lead }),
      actions,
      recents.length ? h('h2', { text: 'Recent folders' }) : null,
      recents.length ? h('ul', { class: 'recent-list' }, recentItems) : null,
      h('h2', { text: 'Shortcuts' }),
      keyList(SHORTCUTS),
      h('details', { class: 'more-keys' }, h('summary', { text: 'More shortcuts' }), keyList(MORE_SHORTCUTS)),
    ),
  );
}

function keyList(rows) {
  return h('dl', { class: 'keys' }, rows.flatMap(([k, d]) => [h('dt', null, h('kbd', { text: k })), h('dd', { text: d })]));
}
