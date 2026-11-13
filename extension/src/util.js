// Small shared helpers. No dependencies.

export const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Tiny DOM builder: h('div', { class: 'x', text: 'hi', onclick }, child, ...) */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value == null || value === false) continue;
      if (key === 'class') el.className = value;
      else if (key === 'text') el.textContent = value;
      else if (key === 'html') el.innerHTML = value; // only ever used with our own constant SVG icons
      else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
      else if (value === true) el.setAttribute(key, '');
      else el.setAttribute(key, value);
    }
  }
  for (const child of children.flat()) {
    if (child != null && child !== false) el.append(child);
  }
  return el;
}

/** localStorage wrapper that never throws (storage can be blocked or full). */
export const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(`docshelf:${key}`);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try { localStorage.setItem(`docshelf:${key}`, JSON.stringify(value)); } catch { /* ignore */ }
  },
  remove(key) {
    try { localStorage.removeItem(`docshelf:${key}`); } catch { /* ignore */ }
  },
};

// ---- Paths (always '/'-separated and relative to the opened root folder) ----

export const basename = (p) => p.slice(p.lastIndexOf('/') + 1);

export function dirname(p) {
  const i = p.lastIndexOf('/');
  return i < 0 ? '' : p.slice(0, i);
}

/** Resolve `rel` against directory `baseDir`. Returns null if it escapes the root. */
export function resolvePath(baseDir, rel) {
  const parts = rel.startsWith('/') || !baseDir ? [] : baseDir.split('/');
  for (const seg of rel.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      if (!parts.length) return null;
      parts.pop();
    } else {
      parts.push(seg);
    }
  }
  return parts.join('/');
}

export function safeDecode(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let n = bytes;
  let i = -1;
  do { n /= 1024; i++; } while (n >= 1024 && i < units.length - 1);
  return `${n.toFixed(n < 10 ? 1 : 0)} ${units[i]}`;
}

/** A toggle button for the per-document toolbar. */
export function toggleButton(label, title, pressed, onToggle) {
  const btn = h('button', { class: 'tb-btn', title, 'aria-pressed': String(pressed), text: label });
  btn.addEventListener('click', () => {
    const next = btn.getAttribute('aria-pressed') !== 'true';
    btn.setAttribute('aria-pressed', String(next));
    onToggle(next);
  });
  return btn;
}

let toastTimer;
export function toast(message, ms = 2800) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}
