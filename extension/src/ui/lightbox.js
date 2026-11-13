// Full-window view of an image or diagram: fits to the window, wheel or +/-
// to zoom, drag to pan, double-click or 0 to reset, Esc or click outside to close.

import { h } from '../util.js';

let current = null;

export function closeLightbox() {
  current?.close();
}

/** `content` is an <img> or <svg> element (it is shown as-is, so pass a copy). */
export function openLightbox(content, { title = '', width = 0, height = 0 } = {}) {
  closeLightbox();
  const stage = h('div', { class: 'lb-stage' }, content);
  const zoomLabel = h('span', { class: 'lb-zoom' });
  const overlay = h(
    'div',
    { class: 'lightbox', role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'Image', tabindex: '-1' },
    stage,
    h('div', { class: 'lb-bar' },
      h('span', { class: 'lb-title', text: title }),
      zoomLabel,
      h('span', { class: 'lb-hint', text: 'Scroll to zoom · drag to move · Esc to close' }),
      h('button', { class: 'lb-close', type: 'button', 'aria-label': 'Close', text: '×', onclick: () => close() })),
  );
  document.body.append(overlay);

  // Natural size: images know theirs; SVGs come from their viewBox.
  let w = width || content.naturalWidth || 0;
  let hgt = height || content.naturalHeight || 0;
  if (content instanceof SVGElement) {
    const vb = content.viewBox?.baseVal;
    w = vb?.width || content.getBoundingClientRect().width || 800;
    hgt = vb?.height || content.getBoundingClientRect().height || 600;
    content.removeAttribute('style');
    content.setAttribute('width', w);
    content.setAttribute('height', hgt);
  }
  w ||= 800;
  hgt ||= 600;
  stage.style.width = `${w}px`;
  stage.style.height = `${hgt}px`;

  let scale = 1;
  let x = 0;
  let y = 0;
  let fitScale = 1;
  const apply = () => {
    stage.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    zoomLabel.textContent = `${Math.round(scale * 100)}%`;
  };
  const fit = () => {
    const pad = 48;
    fitScale = Math.min((innerWidth - pad * 2) / w, (innerHeight - pad * 2 - 40) / hgt, 4);
    scale = fitScale;
    x = (innerWidth - w * scale) / 2;
    y = (innerHeight - 40 - hgt * scale) / 2;
    apply();
  };
  const zoomAt = (factor, cx = innerWidth / 2, cy = innerHeight / 2) => {
    const next = Math.min(Math.max(scale * factor, Math.min(fitScale, 1) / 4), 16);
    x = cx - ((cx - x) * next) / scale;
    y = cy - ((cy - y) * next) / scale;
    scale = next;
    apply();
  };
  fit();

  overlay.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomAt(Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0015)), e.clientX, e.clientY);
  }, { passive: false });

  let drag = null;
  let moved = false;
  overlay.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('.lb-bar')) return;
    drag = { sx: e.clientX - x, sy: e.clientY - y, px: e.clientX, py: e.clientY };
    moved = false;
    overlay.setPointerCapture(e.pointerId);
    overlay.classList.add('dragging');
  });
  overlay.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (Math.abs(e.clientX - drag.px) + Math.abs(e.clientY - drag.py) > 3) moved = true;
    x = e.clientX - drag.sx;
    y = e.clientY - drag.sy;
    apply();
  });
  overlay.addEventListener('pointerup', (e) => {
    if (!drag) return;
    drag = null;
    overlay.classList.remove('dragging');
    // A plain click on the backdrop (not the picture) closes.
    if (!moved && !stage.contains(e.target) && !e.target.closest('.lb-bar')) close();
  });
  overlay.addEventListener('dblclick', (e) => {
    if (e.target.closest('.lb-bar')) return;
    if (Math.abs(scale - fitScale) > 0.01) fit();
    else zoomAt(Math.max(1, fitScale * 2) / scale, e.clientX, e.clientY);
  });

  const onKey = (e) => {
    if (e.key === 'Escape') close();
    else if (e.key === '+' || e.key === '=') zoomAt(1.25);
    else if (e.key === '-') zoomAt(0.8);
    else if (e.key === '0') fit();
    else return;
    e.preventDefault();
    e.stopPropagation();
  };
  document.addEventListener('keydown', onKey, true);
  addEventListener('resize', fit);
  const previousFocus = document.activeElement;
  overlay.focus();

  function close() {
    document.removeEventListener('keydown', onKey, true);
    removeEventListener('resize', fit);
    overlay.remove();
    current = null;
    previousFocus?.focus?.({ preventScroll: true });
  }
  current = { close };
}
