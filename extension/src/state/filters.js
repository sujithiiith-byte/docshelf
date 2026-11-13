import { Emitter } from './emitter.js';
import { TYPES } from '../fs/types.js';

/** Which document types are shown, plus the name filter from the search box. */
export class Filters extends Emitter {
  constructor(saved) {
    super();
    const all = Object.keys(TYPES);
    const fromSave = (saved?.active ?? []).filter((t) => all.includes(t));
    this.active = new Set(fromSave.length ? fromSave : all);
    this.query = '';
  }

  toggle(type) {
    if (this.active.has(type)) this.active.delete(type);
    else this.active.add(type);
    this.emit('change');
  }

  /** Show only this type. Doing it again on the only active type shows everything. */
  solo(type) {
    const onlyThis = this.active.size === 1 && this.active.has(type);
    this.active = new Set(onlyThis ? Object.keys(TYPES) : [type]);
    this.emit('change');
  }

  setQuery(q) {
    const next = q.trim().toLowerCase();
    if (next === this.query) return;
    this.query = next;
    this.emit('change');
  }

  matches(fileNode) {
    return this.active.has(fileNode.type) && (!this.query || fileNode.name.toLowerCase().includes(this.query));
  }

  toJSON() {
    return { active: [...this.active] };
  }
}
