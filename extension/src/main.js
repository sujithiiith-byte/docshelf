// DocShelf workspace: wires folder access, explorer, tabs and viewers together.
// Each browser tab is its own workspace; its folder is kept in the URL
// (?f=<folder id>) so reloads and Chrome's session restore bring it back.

import { TYPES } from './fs/types.js';
import { scanFolder } from './fs/scanner.js';
import { pickFolder, listRecent, remember, forget, ensureReadPermission } from './fs/folderAccess.js';
import { Filters } from './state/filters.js';
import { Explorer } from './ui/explorer.js';
import { EditorGroup } from './ui/editorGroup.js';
import { SearchPanel } from './ui/searchPanel.js';
import { QuickOpen } from './ui/quickOpen.js';
import { showMenu, closeMenu } from './ui/contextMenu.js';
import { renderWelcome } from './ui/welcome.js';
import { ICONS } from './ui/icons.js';
import { clearHighlights } from './viewers/highlight.js';
import { h, store, debounce, toast } from './util.js';

const $ = (id) => document.getElementById(id);
const els = {
  app: $('app'),
  rootName: $('rootName'),
  btnOpen: $('btnOpen'),
  btnSearch: $('btnSearch'),
  btnRefresh: $('btnRefresh'),
  btnCollapse: $('btnCollapse'),
  btnTheme: $('btnTheme'),
  filters: $('filters'),
  search: $('search'),
  tree: $('tree'),
  searchPanel: $('searchPanel'),
  status: $('status'),
  resizer: $('resizer'),
  groups: $('groups'),
  welcome: $('welcome'),
  btnHideSidebar: $('btnHideSidebar'),
  btnShowSidebar: $('btnShowSidebar'),
  btnRailSearch: $('btnRailSearch'),
};

const SUPPORTED = 'showDirectoryPicker' in window;
const RESCAN_ON_FOCUS_AFTER_MS = 10_000;

const state = {
  root: null, // FileSystemDirectoryHandle
  rootId: null, // id in the recent-folders list (keys per-folder saved state)
  tree: null,
  index: new Map(), // path -> node
  lastScan: 0,
  scanToken: 0,
};

// ---- Workspace API (what views and the explorer can ask for) ------------------

const workspace = {
  get rootName() {
    return state.root?.name ?? '';
  },
  async getFileHandle(path) {
    const known = state.index.get(path);
    if (known?.kind === 'file') return known.handle;
    const parts = path.split('/');
    let dir = state.root;
    for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part);
    return dir.getFileHandle(parts.at(-1));
  },
  /** side: open in the other split group (created if needed). */
  open(path, { pin = false, fragment = null, find = null, side = false } = {}) {
    const group = side ? sideGroup() : activeGroup;
    const tab = group.tabs.open(path, { pin: pin || side });
    if (side) setActiveGroup(group);
    if (fragment) group.host.revealFragment(tab.id, fragment);
    if (find) group.host.find(tab.id, find.query, find.index);
  },
  reveal(path) {
    if (els.app.classList.contains('sidebar-hidden')) toggleSidebar();
    setSidebarMode('files');
    explorer.reveal(path);
  },
};

const filters = new Filters(store.get('filters'));
const explorer = new Explorer(els.tree, {
  filters,
  onOpen: (path, opts) => workspace.open(path, opts),
  onExpandChange: () => saveWorkspaceSoon(),
});
const files = () => [...state.index.values()].filter((n) => n.kind === 'file');
const searchPanel = new SearchPanel(els.searchPanel, {
  getNodes: files,
  onOpen: (path, opts) => workspace.open(path, opts),
});
const recentDocs = []; // most recently viewed paths, for Ctrl+P
const quickOpen = new QuickOpen({
  getFiles: files,
  getRecent: () => recentDocs,
  onOpen: (path, opts) => workspace.open(path, opts),
});

// ---- Editor groups: one, or two side by side ---------------------------------------

const groups = [];
let activeGroup = null;
let splitRatio = store.get('ui.splitRatio', 0.5);
const groupResizer = h('div', { class: 'group-resizer', role: 'separator', 'aria-orientation': 'vertical', title: 'Drag to resize · double-click to reset' });
const anyTabs = () => groups.some((g) => g.tabs.tabs.length > 0);

function createGroup() {
  const g = new EditorGroup({ workspace, onFocus: setActiveGroup, onSplit: (tab) => workspace.open(tab.path, { side: true }) });
  g.tabs.on('change', () => onGroupChange(g));
  if (groups.length) els.groups.append(groupResizer);
  els.groups.append(g.el);
  groups.push(g);
  els.groups.classList.toggle('split', groups.length > 1);
  applySplitRatio();
  return g;
}

function closeGroup(g) {
  g.closing = true;
  groups.splice(groups.indexOf(g), 1);
  g.dispose();
  groupResizer.remove();
  groups[0].el.style.flex = '';
  els.groups.classList.remove('split');
  if (activeGroup === g) {
    activeGroup = null;
    setActiveGroup(groups[0]);
  }
  saveWorkspaceSoon();
}

/** The group "to the side" of the active one, creating the split if needed. */
function sideGroup() {
  if (groups.length < 2) createGroup();
  return groups.find((g) => g !== activeGroup);
}

function setActiveGroup(g) {
  if (activeGroup === g) return;
  activeGroup = g;
  groups.forEach((x) => x.el.classList.toggle('active-group', x === g));
  onActiveDocChange();
}

function onGroupChange(g) {
  if (g.closing) return;
  if (!g.tabs.tabs.length && groups.length > 1) {
    closeGroup(g); // closing the last tab on one side removes the split
    return;
  }
  if (g === activeGroup) onActiveDocChange();
  const hasTabs = anyTabs();
  if (hasTabs !== els.app.classList.contains('has-tabs')) {
    els.app.classList.toggle('has-tabs', hasTabs);
    if (!hasTabs) showWelcome();
  }
  saveWorkspaceSoon();
}

function onActiveDocChange() {
  const tab = activeGroup?.tabs.active;
  explorer.setActive(tab?.path ?? null);
  if (tab) {
    const i = recentDocs.indexOf(tab.path);
    if (i >= 0) recentDocs.splice(i, 1);
    recentDocs.unshift(tab.path);
    recentDocs.length = Math.min(recentDocs.length, 20);
  }
  updateTitle();
}

function resetGroups() {
  while (groups.length > 1) closeGroup(groups[1]);
  groups[0].tabs.reset();
}

function applySplitRatio() {
  if (groups.length < 2) return;
  groups[0].el.style.flex = `${splitRatio} 1 0`;
  groups[1].el.style.flex = `${1 - splitRatio} 1 0`;
}

groupResizer.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  groupResizer.setPointerCapture(e.pointerId);
  groupResizer.classList.add('dragging');
  const box = els.groups.getBoundingClientRect();
  const move = (ev) => {
    splitRatio = Math.min(0.8, Math.max(0.2, (ev.clientX - box.left) / box.width));
    applySplitRatio();
  };
  groupResizer.addEventListener('pointermove', move);
  groupResizer.addEventListener('pointerup', () => {
    groupResizer.removeEventListener('pointermove', move);
    groupResizer.classList.remove('dragging');
    store.set('ui.splitRatio', splitRatio);
  }, { once: true });
});
groupResizer.addEventListener('dblclick', () => {
  splitRatio = 0.5;
  applySplitRatio();
  store.set('ui.splitRatio', splitRatio);
});

// Clicks inside a PDF (an iframe) don't reach our page; notice the focus move instead.
window.addEventListener('blur', () => setTimeout(() => {
  const focused = document.activeElement;
  if (focused?.tagName === 'IFRAME') {
    const g = groups.find((x) => x.el.contains(focused));
    if (g) setActiveGroup(g);
  }
}));

createGroup();
setActiveGroup(groups[0]);

filters.on('change', () => {
  store.set('filters', filters.toJSON());
  renderFilters();
  explorer.render();
  updateStatus();
});

function updateTitle() {
  const folder = state.root?.name;
  const doc = activeGroup?.tabs.active?.name;
  document.title = [doc, folder, 'DocShelf'].filter(Boolean).slice(0, 2).join(' · ');
}

// ---- Per-folder saved state (open tabs, expanded folders) ----------------------

function saveWorkspace() {
  if (!state.rootId) return;
  store.set(`ws:${state.rootId}`, {
    tabs: groups[0].tabs.serialize(),
    split: groups[1]?.tabs.serialize() ?? null,
    activeGroup: groups.indexOf(activeGroup),
    expanded: [...explorer.expanded],
  });
}
const saveWorkspaceSoon = debounce(saveWorkspace, 300);
window.addEventListener('pagehide', saveWorkspace);

// ---- Other DocShelf tabs (each can hold a different folder) ---------------------

/** Map of folderId -> { tabId, windowId } for DocShelf tabs other than this one. */
async function otherWorkspaces() {
  const found = new Map();
  try {
    const me = await chrome.tabs.getCurrent();
    const contexts = await chrome.runtime.getContexts({ contextTypes: ['TAB'] });
    for (const c of contexts) {
      if (c.tabId === me?.id || !c.documentUrl?.includes('/workspace.html')) continue;
      const id = new URL(c.documentUrl).searchParams.get('f');
      found.set(id ?? `none:${c.tabId}`, { tabId: c.tabId, windowId: c.windowId });
    }
  } catch { /* not available: behave as if alone */ }
  return found;
}

async function focusTab({ tabId, windowId }) {
  try {
    await chrome.tabs.update(tabId, { active: true });
    await chrome.windows.update(windowId, { focused: true });
  } catch { /* tab closed meanwhile */ }
}

// ---- Opening folders ----------------------------------------------------------

async function chooseFolder() {
  if (!SUPPORTED) return;
  try {
    const handle = await pickFolder();
    if (handle) await openRoot(handle, { request: true });
  } catch (err) {
    toast(`Couldn't open the folder: ${err.message}`);
  }
}

async function openRoot(handle, { request }) {
  if (!(await ensureReadPermission(handle, { request }))) {
    if (request) toast(`Permission to read “${handle.name}” was not granted.`);
    return false;
  }
  saveWorkspace();
  const rec = await remember(handle);
  Object.assign(state, { root: handle, rootId: rec.id, tree: null, index: new Map() });
  history.replaceState(null, '', `?f=${encodeURIComponent(rec.id)}`);
  const saved = store.get(`ws:${rec.id}`, {});

  resetGroups();
  recentDocs.length = 0;
  searchPanel.reset();
  explorer.setExpanded(saved.expanded);
  els.app.classList.remove('no-root');
  els.rootName.textContent = handle.name;
  els.rootName.title = handle.name;
  els.search.value = '';
  filters.setQuery('');
  updateTitle();

  await rescan();
  if (state.root === handle) {
    const exists = (p) => state.index.get(p)?.kind === 'file';
    groups[0].tabs.restore(saved.tabs, exists);
    if (saved.split?.tabs?.length) createGroup().tabs.restore(saved.split, exists);
    setActiveGroup(groups[Math.min(Math.max(saved.activeGroup ?? 0, 0), groups.length - 1)]);
  }
  showWelcome();
  return true;
}

async function rescan({ quiet = false } = {}) {
  if (!state.root) return;
  const token = ++state.scanToken;
  const rootHandle = state.root;
  state.lastScan = Date.now();
  if (!quiet) {
    setStatus('Scanning…');
    if (!state.tree) explorer.clear('Scanning…');
  }
  try {
    const { root, index } = await scanFolder(rootHandle, {
      onProgress: (n) => { if (!quiet && token === state.scanToken) setStatus(`Scanning… ${n} folders`); },
    });
    if (token !== state.scanToken || rootHandle !== state.root) return;
    Object.assign(state, { tree: root, index, lastScan: Date.now() });
    explorer.setTree(root);
    renderFilters();
    updateStatus();
  } catch (err) {
    if (token !== state.scanToken) return;
    setStatus('Scan failed');
    toast(err?.name === 'NotAllowedError'
      ? 'Lost permission to read the folder. Reopen it from the welcome screen.'
      : `Scan failed: ${err?.message ?? err}`);
  }
}

// ---- Sidebar pieces -------------------------------------------------------------

function renderFilters() {
  const counts = state.tree?.counts ?? {};
  els.filters.replaceChildren(...Object.entries(TYPES).map(([type, def]) =>
    h('button', {
      class: `chip type-${type}`,
      'data-type': type,
      'aria-pressed': String(filters.active.has(type)),
      title: `Show ${def.label} files · Shift+click: only ${def.label}`,
    }, def.short, h('span', { class: 'n', text: state.tree ? String(counts[type] ?? 0) : '' })),
  ));
}

els.filters.addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  if (e.shiftKey || e.altKey) filters.solo(chip.dataset.type);
  else filters.toggle(chip.dataset.type);
});

els.search.addEventListener('input', debounce(() => filters.setQuery(els.search.value), 80));
els.search.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    els.search.value = '';
    filters.setQuery('');
    els.tree.focus();
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    els.tree.focus();
  }
});

function setSidebarMode(mode) {
  const searching = mode === 'search';
  els.app.classList.toggle('mode-search', searching);
  els.btnSearch.setAttribute('aria-pressed', String(searching));
  if (searching) {
    if (els.app.classList.contains('sidebar-hidden')) toggleSidebar();
    searchPanel.focus();
  } else {
    clearHighlights();
  }
}
els.searchPanel.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.preventDefault(); setSidebarMode('files'); els.tree.focus(); }
});

function setStatus(text) {
  els.status.textContent = text;
}

function updateStatus() {
  if (!state.tree) return;
  const total = Object.values(state.tree.counts).reduce((a, b) => a + b, 0);
  const shown = explorer.visibleCount;
  setStatus(shown === total ? `${total} document${total === 1 ? '' : 's'}` : `${shown} of ${total} documents`);
}

// ---- Right-click menus ------------------------------------------------------------

const copyPath = (path) => navigator.clipboard.writeText(path).then(
  () => toast(`Copied “${path}”`),
  () => toast('Could not copy to the clipboard.'),
);

els.groups.addEventListener('contextmenu', (e) => {
  const el = e.target.closest('.tab');
  if (!el) return;
  e.preventDefault();
  const group = groups.find((g) => g.el.contains(el));
  const tabs = group?.tabs;
  const tab = tabs?.get(el.dataset.id);
  if (!tab) return;
  const i = tabs.tabs.indexOf(tab);
  showMenu(e.clientX, e.clientY, [
    { label: 'Keep open', hint: 'Alt+P', disabled: tab.pinned, action: () => tabs.pin(tab.id) },
    { label: 'Open to the side', hint: 'Ctrl+\\', action: () => { setActiveGroup(group); workspace.open(tab.path, { side: true }); } },
    'sep',
    { label: 'Close', hint: 'Alt+W', action: () => tabs.close(tab.id) },
    { label: 'Close others', disabled: tabs.tabs.length < 2, action: () => tabs.closeMany(tab.id, 'others') },
    { label: 'Close to the right', disabled: i === tabs.tabs.length - 1, action: () => tabs.closeMany(tab.id, 'right') },
    { label: 'Close all', action: () => tabs.closeMany(tab.id, 'all') },
    'sep',
    { label: 'Copy path', action: () => copyPath(tab.path) },
    { label: 'Show in explorer', action: () => workspace.reveal(tab.path) },
  ]);
});

els.tree.addEventListener('contextmenu', (e) => {
  const row = e.target.closest('.row');
  if (!row) return;
  e.preventDefault();
  const path = row.dataset.path;
  if (row.classList.contains('dir')) {
    const open = explorer.expanded.has(path);
    showMenu(e.clientX, e.clientY, [
      { label: open ? 'Collapse' : 'Expand', action: () => explorer.toggle(path) },
      { label: 'Collapse all', action: () => explorer.collapseAll() },
      'sep',
      { label: 'Copy path', action: () => copyPath(path) },
    ]);
  } else {
    showMenu(e.clientX, e.clientY, [
      { label: 'Open preview', action: () => workspace.open(path) },
      { label: 'Open and keep open', hint: 'Dbl-click', action: () => workspace.open(path, { pin: true }) },
      { label: 'Open to the side', hint: 'Alt+click', action: () => workspace.open(path, { side: true }) },
      'sep',
      { label: 'Copy path', action: () => copyPath(path) },
    ]);
  }
});

// ---- Welcome screen ---------------------------------------------------------------

async function showWelcome() {
  if (anyTabs()) return;
  const [recents, elsewhere] = await Promise.all([listRecent().catch(() => []), otherWorkspaces()]);
  if (anyTabs()) return;
  renderWelcome(els.welcome, {
    rootName: state.root?.name ?? null,
    recents,
    currentId: state.rootId,
    openElsewhere: new Set([...elsewhere.keys()]),
    suggested: state.root ? null : recents.find((r) => r.id === pendingFolderId) ?? recents.find((r) => !elsewhere.has(r.id)),
    unsupported: !SUPPORTED,
    onPick: chooseFolder,
    onOpenRecent: (rec) => {
      if (rec.id === state.rootId) return;
      if (elsewhere.has(rec.id)) focusTab(elsewhere.get(rec.id));
      else openRoot(rec.handle, { request: true });
    },
    onForget: async (rec) => {
      await forget(rec.id);
      showWelcome();
    },
  });
}

// ---- Layout: sidebar width, hide/show, theme ----------------------------------------

const DEFAULT_SIDEBAR = 280;
function setSidebarWidth(px) {
  const w = Math.round(Math.max(180, Math.min(px, window.innerWidth * 0.6)));
  els.app.style.setProperty('--sidebar-w', `${w}px`);
  return w;
}

function setupResizer() {
  let width = setSidebarWidth(store.get('ui.sidebarWidth', DEFAULT_SIDEBAR));
  els.resizer.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    els.resizer.setPointerCapture(e.pointerId);
    els.resizer.classList.add('dragging');
    const move = (ev) => { width = setSidebarWidth(ev.clientX); };
    els.resizer.addEventListener('pointermove', move);
    els.resizer.addEventListener('pointerup', () => {
      els.resizer.removeEventListener('pointermove', move);
      els.resizer.classList.remove('dragging');
      store.set('ui.sidebarWidth', width);
    }, { once: true });
  });
  els.resizer.addEventListener('dblclick', () => {
    width = setSidebarWidth(DEFAULT_SIDEBAR);
    store.set('ui.sidebarWidth', width);
  });
}

function toggleSidebar() {
  const hidden = els.app.classList.toggle('sidebar-hidden');
  store.set('ui.sidebarHidden', hidden);
}

const THEMES = ['auto', 'light', 'dark'];
const THEME_ICON = { auto: ICONS.auto, light: ICONS.sun, dark: ICONS.moon };
function applyTheme(theme) {
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  els.btnTheme.innerHTML = THEME_ICON[theme];
  els.btnTheme.title = `Theme: ${theme} (click to change)`;
}

// ---- Keyboard ------------------------------------------------------------------------

document.addEventListener('keydown', (e) => {
  if (quickOpen.isOpen) return; // the picker handles its own keys
  const typing = e.target.closest?.('input, textarea, [contenteditable="true"]');
  const ctrl = e.ctrlKey || e.metaKey;
  const plainCtrl = ctrl && !e.shiftKey && !e.altKey;
  if (plainCtrl && e.code === 'KeyP') {
    e.preventDefault();
    closeMenu();
    if (state.root) quickOpen.open();
  } else if (ctrl && e.shiftKey && !e.altKey && e.code === 'KeyF') {
    e.preventDefault();
    if (state.root) setSidebarMode('search');
  } else if (plainCtrl && e.code === 'KeyB') {
    e.preventDefault();
    toggleSidebar();
  } else if (plainCtrl && e.code === 'KeyO') {
    e.preventDefault();
    chooseFolder();
  } else if (e.altKey && !ctrl && e.code === 'KeyW') {
    e.preventDefault();
    const { tabs } = activeGroup;
    if (tabs.active) tabs.close(tabs.active.id);
  } else if (e.altKey && !ctrl && e.code === 'KeyP') {
    e.preventDefault();
    const { tabs } = activeGroup;
    if (tabs.active) tabs.pin(tabs.active.id);
  } else if (e.altKey && !ctrl && (e.code === 'BracketRight' || e.code === 'BracketLeft')) {
    e.preventDefault();
    activeGroup.tabs.cycle(e.code === 'BracketRight' ? 1 : -1);
  } else if (ctrl && !e.altKey && e.code === 'Backslash') {
    e.preventDefault();
    const tab = activeGroup.tabs.active;
    if (tab) workspace.open(tab.path, { side: true });
  } else if (!typing && !ctrl && !e.altKey && e.key === '/') {
    e.preventDefault();
    if (els.app.classList.contains('sidebar-hidden')) toggleSidebar();
    setSidebarMode('files');
    els.search.focus();
    els.search.select();
  }
});

// Pick up new/removed files when coming back to the tab.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  if (state.root && Date.now() - state.lastScan > RESCAN_ON_FOCUS_AFTER_MS) rescan({ quiet: true });
  if (!anyTabs()) showWelcome(); // refresh "open in another tab" labels
});

// ---- Start -----------------------------------------------------------------------------

// The folder this tab was showing before a reload / session restore, if any.
const pendingFolderId = new URLSearchParams(location.search).get('f');

async function init() {
  els.btnOpen.innerHTML = ICONS.folder;
  els.btnHideSidebar.innerHTML = ICONS.sidebarHide;
  els.btnShowSidebar.innerHTML = ICONS.sidebarShow;
  els.btnRailSearch.innerHTML = ICONS.search;
  els.btnHideSidebar.addEventListener('click', toggleSidebar);
  els.btnShowSidebar.addEventListener('click', toggleSidebar);
  els.btnRailSearch.addEventListener('click', () => setSidebarMode('search'));
  els.btnSearch.innerHTML = ICONS.search;
  els.btnRefresh.innerHTML = ICONS.refresh;
  els.btnCollapse.innerHTML = ICONS.collapse;
  els.btnOpen.addEventListener('click', chooseFolder);
  els.btnSearch.addEventListener('click', () => {
    setSidebarMode(els.app.classList.contains('mode-search') ? 'files' : 'search');
  });
  els.btnRefresh.addEventListener('click', () => rescan());
  els.btnCollapse.addEventListener('click', () => explorer.collapseAll());

  let theme = store.get('ui.theme', 'auto');
  applyTheme(theme);
  els.btnTheme.addEventListener('click', () => {
    theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
    store.set('ui.theme', theme);
    applyTheme(theme);
  });

  setupResizer();
  if (store.get('ui.sidebarHidden', false)) els.app.classList.add('sidebar-hidden');
  renderFilters();
  explorer.clear(SUPPORTED ? 'Open a folder to see its documents.' : 'Folder access is not available in this browser.');

  if (SUPPORTED) {
    const recents = await listRecent().catch(() => []);
    if (pendingFolderId) {
      // Reloaded or restored tab: reopen its own folder.
      const rec = recents.find((r) => r.id === pendingFolderId);
      if (rec && (await openRoot(rec.handle, { request: false }))) return;
    } else if (recents[0] && !(await otherWorkspaces()).size) {
      // First DocShelf tab: reopen the last folder. Extra tabs start on the
      // welcome screen so you can pick a different folder.
      if (await openRoot(recents[0].handle, { request: false })) return;
    }
  }
  showWelcome();
}

init();

// Handy for debugging from DevTools.
window.docshelf = {
  state, filters, explorer, openRoot, rescan, quickOpen, searchPanel, setSidebarMode, groups,
  get tabs() { return activeGroup.tabs; },
  setActiveGroup,
};
