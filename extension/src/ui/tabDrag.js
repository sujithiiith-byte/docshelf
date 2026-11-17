// Drag tabs like in VS Code:
//  - along the tab strip to reorder them
//  - onto the other side's tabs or document area to move them there
//  - onto the right half of the document area (no split yet) to open a split

let drag = null; // { group, id }

export function initTabDrag(groupsEl, { getGroups, reorder, moveTo, moveToNewGroup }) {
  const groupOf = (el) => {
    const groupEl = el?.closest?.('.group');
    return getGroups().find((g) => g.el === groupEl) ?? null;
  };

  function clear() {
    groupsEl.querySelectorAll('.drop-before, .drop-after, .drop-into, .drop-split')
      .forEach((el) => el.classList.remove('drop-before', 'drop-after', 'drop-into', 'drop-split'));
  }

  /** Where would a drop at this event land? */
  function target(e) {
    const group = groupOf(e.target);
    if (!group || !drag) return null;
    const tabbar = e.target.closest('.tabbar');
    if (tabbar) {
      const tabEls = [...tabbar.querySelectorAll('.tab')];
      let index = tabEls.length;
      for (let i = 0; i < tabEls.length; i++) {
        const r = tabEls[i].getBoundingClientRect();
        if (e.clientX < r.left + r.width / 2) { index = i; break; }
      }
      return { kind: 'tabs', group, index, tabEls };
    }
    if (group !== drag.group) return { kind: 'into', group };
    // Same group's document area: split, if there's only one side and something stays behind.
    const views = group.el.querySelector('.views');
    const r = views.getBoundingClientRect();
    if (getGroups().length === 1 && group.tabs.tabs.length > 1 && e.clientX > r.left + r.width / 2 && e.clientY > r.top) {
      return { kind: 'split', group, views };
    }
    return null;
  }

  function show(t) {
    clear();
    if (t.kind === 'tabs') {
      const { index, tabEls } = t;
      if (index < tabEls.length) tabEls[index].classList.add('drop-before');
      else tabEls.at(-1)?.classList.add('drop-after');
    } else if (t.kind === 'into') {
      t.group.el.classList.add('drop-into');
    } else if (t.kind === 'split') {
      t.views.classList.add('drop-split');
    }
  }

  groupsEl.addEventListener('dragstart', (e) => {
    const tabEl = e.target.closest?.('.tab');
    const group = groupOf(tabEl);
    if (!tabEl || !group) return;
    drag = { group, id: tabEl.dataset.id };
    const tab = group.tabs.get(drag.id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', tab?.path ?? '');
    tabEl.classList.add('dragging');
    document.body.classList.add('tab-dragging'); // lets the drag pass over PDF frames
  });

  groupsEl.addEventListener('dragover', (e) => {
    const t = target(e);
    if (!t) { clear(); return; }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    show(t);
  });

  groupsEl.addEventListener('dragleave', (e) => {
    if (!groupsEl.contains(e.relatedTarget)) clear();
  });

  // The dragged tab is re-rendered by the drop, so 'dragend' may never reach us:
  // finish up on drop as well.
  function end() {
    clear();
    groupsEl.querySelector('.tab.dragging')?.classList.remove('dragging');
    document.body.classList.remove('tab-dragging');
    drag = null;
  }

  groupsEl.addEventListener('drop', (e) => {
    const t = target(e);
    if (!t) { end(); return; }
    e.preventDefault();
    const { group: from, id } = drag;
    end();
    if (t.kind === 'tabs' && t.group === from) reorder(from, id, t.index);
    else if (t.kind === 'tabs') moveTo(from, id, t.group, t.index);
    else if (t.kind === 'into') moveTo(from, id, t.group, t.group.tabs.tabs.length);
    else if (t.kind === 'split') moveToNewGroup(from, id);
  });

  groupsEl.addEventListener('dragend', end);
}
