// The decorate hint bar (bottom centre while placing finds in the Nest): the selected item's glyph,
// name and count, and key prompts (rotate, place, cancel, cycle). Prompts name an action (its key
// label comes from actions.labelFor) or carry a literal key.
import { ACTIONS } from '../core/contracts.js';
import { h } from './dom.js';
import { glyph } from './glyphs.js';
import { RARITY } from '../data/items.js';

export const DEFAULT_PROMPTS = [
  { action: ACTIONS.ROTATE, label: 'Rotate' },
  { action: ACTIONS.INTERACT, label: 'Place' },
  { action: ACTIONS.UI_BACK, label: 'Cancel' },
  { action: [ACTIONS.UI_TAB_PREV, ACTIONS.UI_TAB_NEXT], label: 'Cycle' },
];
const FALLBACK_KEYS = { rotate: 'R', interact: 'E', uiBack: 'Esc', uiTabPrev: 'Q', uiTabNext: 'E', decorate: 'F' };

export function createDecorate({ layer, items = [], labelFor = () => null }) {
  const bar = h('div.phl-decorate.is-hidden', { role: 'status' });
  layer.appendChild(bar);

  const keyFor = (action) => {
    const l = labelFor(action);
    const first = Array.isArray(l) ? l[0] : l ? String(l).split(/\s*\/\s*/)[0] : null;
    return first || FALLBACK_KEYS[action] || action;
  };

  /** show({ item: id | item, count, prompts? }) — call again to update. */
  function show({ item, count, prompts = DEFAULT_PROMPTS } = {}) {
    const it = typeof item === 'string' ? items.find((i) => i.id === item) : item;
    bar.innerHTML = '';
    const icon = h('div.phl-deco-icon', { html: it ? glyph(it.look) : '' });
    if (it) icon.style.setProperty('--rc', RARITY[it.rarity]?.color ?? '#e9dccb');
    bar.append(icon,
      h('div', {}, h('div.phl-deco-name', {}, it?.name ?? 'Nothing selected'), h('div.phl-deco-count', {}, count != null ? `${count} in your pocket` : '')),
      h('div.phl-deco-prompts', {}, prompts.map((p) => {
        const acts = Array.isArray(p.action) ? p.action : [p.action];
        const keys = p.key != null ? [p.key] : acts.filter(Boolean).map(keyFor);
        return h('span', {}, keys.map((k) => h('span.phl-keycap', {}, k)), p.label);
      })));
    bar.classList.remove('is-hidden');
  }
  const hide = () => bar.classList.add('is-hidden');
  return { show, hide, el: bar };
}
