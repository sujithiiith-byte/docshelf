// Highlights search matches inside a rendered document using the CSS Custom
// Highlight API, so the document's DOM is never modified.

const ALL = 'docshelf-match';
const CURRENT = 'docshelf-current';

export function clearHighlights() {
  CSS.highlights?.delete(ALL);
  CSS.highlights?.delete(CURRENT);
}

/**
 * Highlight every case-insensitive occurrence of `query` in `root`'s text and
 * return the range for occurrence `index` (clamped), or null if none.
 */
export function highlightText(root, query, index = 0) {
  clearHighlights();
  if (!query || !CSS.highlights) return null;
  const q = query.toLowerCase();
  const ranges = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest('.copy-btn, [hidden]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.data.toLowerCase();
    for (let i = text.indexOf(q); i >= 0; i = text.indexOf(q, i + q.length)) {
      const r = new Range();
      r.setStart(node, i);
      r.setEnd(node, i + q.length);
      ranges.push(r);
      if (ranges.length >= 5000) break;
    }
  }
  if (!ranges.length) return null;
  const current = ranges[Math.min(index, ranges.length - 1)];
  CSS.highlights.set(ALL, new Highlight(...ranges));
  CSS.highlights.set(CURRENT, new Highlight(current));
  return current;
}

/** Scroll `scroller` so that `range` sits about a third of the way down. */
export function scrollRangeIntoView(scroller, range) {
  const rect = range.getBoundingClientRect();
  const box = scroller.getBoundingClientRect();
  scroller.scrollTop += rect.top - box.top - box.height / 3;
}
