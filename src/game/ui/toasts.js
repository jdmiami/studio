// Toasts: small felt notes stacking at the top centre; they fade on their own. Kinds: info (sky),
// find (butter, with the find's glyph when opts.itemId is given), quest (sage), error (rose).
import { h } from './dom.js';
import { glyph } from './glyphs.js';

const KIND_LABEL = { info: 'Note', find: 'New find', quest: 'Quest', error: 'Hmm' };
const MAX = 4;

export function createToasts({ layer, items = [] }) {
  const wrap = h('div.phl-toasts', { 'aria-live': 'polite' });
  layer.appendChild(wrap);
  const live = []; // { el, life }

  function remove(t) {
    const i = live.indexOf(t);
    if (i >= 0) live.splice(i, 1);
    t.el.classList.add('is-leaving');
    setTimeout(() => t.el.remove(), 420);
  }

  /** show(text, kind, { itemId?, duration? = 3.6s, title? }) */
  function show(text, kind = 'info', opts = {}) {
    const item = opts.itemId ? items.find((i) => i.id === opts.itemId) : null;
    const badge = item
      ? h('span.phl-toast-badge', { html: glyph(item.look) })
      : h('span.phl-toast-badge.is-dot');
    const el = h(`div.phl-toast.kind-${kind}`, { role: 'status' }, badge,
      h('div', {}, h('span.phl-toast-kind', {}, opts.title ?? KIND_LABEL[kind] ?? kind), h('span', {}, text)));
    wrap.appendChild(el);
    const t = { el, life: opts.duration ?? (kind === 'error' ? 4.5 : 3.6) };
    live.push(t);
    while (live.length > MAX) remove(live[0]);
    return t;
  }

  function update(dt) {
    for (const t of [...live]) {
      t.life -= dt;
      if (t.life <= 0) remove(t);
    }
  }

  return { show, update, clear: () => [...live].forEach(remove) };
}
