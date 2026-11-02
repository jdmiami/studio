// Small DOM helpers and the felt controls (button, slider, toggle, stepper, tabs) every screen
// builds with. Focusable controls carry data-focus (and a stable data-key so focus survives
// re-renders); left/right "adjust" behaviour is registered per element in a WeakMap.
import { cycleOption, snapValue, stepValue } from './logic.js';

const controllers = new WeakMap();
/** Registers { adjust(dir), activate() } for an element (used by sliders and steppers). */
export function bindControl(el, ctl) { controllers.set(el, ctl); return el; }
export function getControl(el) { return el ? controllers.get(el) : undefined; }

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * h('div.a.b', { attrs / on* handlers / dataset / style / html }, ...children)
 * Children: nodes, strings (text), arrays, or null/false (skipped).
 */
export function h(sel, props = {}, ...children) {
  const [tag, ...classes] = sel.split('.');
  const el = document.createElement(tag || 'div');
  if (classes.length) el.className = classes.join(' ');
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = [el.className, v].filter(Boolean).join(' ');
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/** A felt pill button. opts: { key, kind: 'primary' | 'quiet' | 'danger', disabled, autofocus, icon, sub } */
export function button(label, onClick, opts = {}) {
  const el = h(`button.phl-btn${opts.kind ? `.is-${opts.kind}` : ''}`, {
    type: 'button', 'data-focus': true, 'data-key': opts.key ?? label, disabled: !!opts.disabled,
    'data-autofocus': !!opts.autofocus, class: opts.className, title: opts.title,
  }, opts.icon ? h('span.phl-btn-icon', { html: opts.icon }) : null, h('span.phl-btn-label', {}, label),
  opts.sub ? h('span.phl-btn-sub', {}, opts.sub) : null);
  el.addEventListener('click', (e) => { if (!el.disabled) onClick?.(e); });
  return el;
}

/** A labelled settings row wrapping a control. */
export function row(label, control, hint) {
  return h('div.phl-row', {}, h('div.phl-row-label', {}, label, hint ? h('small', {}, hint) : null), control);
}

/**
 * A felt slider (custom, so arrow keys never double-step a native range input).
 * opts: { key, value, min, max, step, format(v), onChange(v) }
 */
export function slider(opts) {
  const { min = 0, max = 1, step = 0.05, format = (v) => `${Math.round(v * 100)}%` } = opts;
  let value = opts.value ?? min;
  const fill = h('div.phl-slider-fill');
  const knob = h('div.phl-slider-knob');
  const track = h('div.phl-slider-track', {}, fill, knob);
  const out = h('span.phl-slider-value');
  const el = h('div.phl-slider', {
    role: 'slider', 'data-focus': true, 'data-key': opts.key, 'aria-valuemin': min, 'aria-valuemax': max,
    'aria-label': opts.label,
  }, h('span.phl-slider-arrow', { html: '&#8249;' }), track, h('span.phl-slider-arrow', { html: '&#8250;' }), out);
  const paint = () => {
    const t = (value - min) / (max - min || 1);
    fill.style.width = `${t * 100}%`;
    knob.style.left = `${t * 100}%`;
    out.textContent = format(value);
    el.setAttribute('aria-valuenow', String(value));
  };
  const set = (v) => {
    const nv = snapValue(v, { min, max, step });
    if (nv === value) return false;
    value = nv;
    paint();
    opts.onChange?.(value);
    return true;
  };
  paint();
  // Pointer drag on the track.
  const fromPointer = (e) => {
    const r = track.getBoundingClientRect();
    set(min + ((e.clientX - r.left) / Math.max(1, r.width)) * (max - min));
  };
  track.addEventListener('pointerdown', (e) => {
    track.setPointerCapture?.(e.pointerId);
    fromPointer(e);
    const move = (ev) => fromPointer(ev);
    const up = () => { track.removeEventListener('pointermove', move); track.removeEventListener('pointerup', up); };
    track.addEventListener('pointermove', move);
    track.addEventListener('pointerup', up);
  });
  el.querySelectorAll('.phl-slider-arrow').forEach((a, i) => a.addEventListener('click', () => set(stepValue(value, { min, max, step }, i ? 1 : -1))));
  bindControl(el, {
    adjust: (dir) => set(stepValue(value, { min, max, step }, dir)),
    activate: () => false,
  });
  el.setValue = (v) => { value = v; paint(); };
  return el;
}

/** An on/off felt switch (a button; confirm / click toggles). opts: { key, value, onChange(v), labels: [off, on] } */
export function toggle(opts) {
  let value = !!opts.value;
  const [offL, onL] = opts.labels ?? ['Off', 'On'];
  const text = h('span.phl-toggle-text');
  const el = h('button.phl-toggle', { type: 'button', 'data-focus': true, 'data-key': opts.key, role: 'switch', 'aria-label': opts.label },
    h('span.phl-toggle-track', {}, h('span.phl-toggle-knob')), text);
  const paint = () => { el.classList.toggle('is-on', value); el.setAttribute('aria-checked', String(value)); text.textContent = value ? onL : offL; };
  paint();
  el.addEventListener('click', () => { value = !value; paint(); opts.onChange?.(value); });
  bindControl(el, { adjust: (dir) => { const nv = dir > 0; if (nv === value) return false; value = nv; paint(); opts.onChange?.(value); return true; } });
  return el;
}

/** ‹ value › cycler. opts: { key, value, options: [{ value, label }], onChange(v) } */
export function stepper(opts) {
  let value = opts.value;
  const text = h('span.phl-stepper-text');
  const el = h('button.phl-stepper', { type: 'button', 'data-focus': true, 'data-key': opts.key, 'aria-label': opts.label },
    h('span.phl-stepper-arrow', { html: '&#8249;' }), text, h('span.phl-stepper-arrow', { html: '&#8250;' }));
  const paint = () => {
    text.textContent = opts.options.find((o) => o.value === value)?.label ?? String(value);
    const dots = opts.options.map((o) => `<i class="${o.value === value ? 'on' : ''}"></i>`).join('');
    el.dataset.dots = '';
    el.querySelector('.phl-stepper-dots')?.remove();
    el.append(h('span.phl-stepper-dots', { html: dots }));
  };
  const set = (dir) => { value = cycleOption(opts.options, value, dir); paint(); opts.onChange?.(value); return true; };
  paint();
  el.addEventListener('click', (e) => {
    const r = el.getBoundingClientRect();
    set(e.clientX && e.clientX < r.left + r.width * 0.3 ? -1 : 1);
  });
  bindControl(el, { adjust: (dir) => set(dir) });
  return el;
}

/**
 * A tab strip. tabs: [{ id, label }]. onSelect(id). Returns { el, select(id), current() }.
 * Shows the Q/E (LB/RB) hint at its ends.
 */
export function tabStrip(tabs, active, onSelect, { hintPrev = 'Q', hintNext = 'E' } = {}) {
  let cur = active ?? tabs[0]?.id;
  const btns = tabs.map((t) => h('button.phl-tab', {
    type: 'button', 'data-focus': true, 'data-key': `tab:${t.id}`, role: 'tab', onclick: () => select(t.id),
  }, t.label));
  const el = h('div.phl-tabs', { role: 'tablist', 'data-focus-group': 'tabs', 'data-focus-wrap': 'x' }, h('span.phl-keycap.phl-tab-hint', {}, hintPrev), btns, h('span.phl-keycap.phl-tab-hint', {}, hintNext));
  function paint() { tabs.forEach((t, i) => { btns[i].classList.toggle('is-active', t.id === cur); btns[i].setAttribute('aria-selected', String(t.id === cur)); }); }
  function select(id) { if (id === cur) return; cur = id; paint(); onSelect?.(id); }
  paint();
  return {
    el, select, current: () => cur,
    step(delta) { const i = tabs.findIndex((t) => t.id === cur); select(tabs[(i + delta + tabs.length) % tabs.length].id); },
  };
}

/** A screen header: title (+ optional subtitle) and a back chip. */
export function header(title, { sub, onBack, backLabel = 'Back' } = {}) {
  return h('div.phl-header', {},
    h('div.phl-header-titles', {}, h('h2.phl-title', {}, title), sub ? h('div.phl-sub', {}, sub) : null),
    onBack ? h('button.phl-back', { type: 'button', 'data-focus': true, 'data-key': 'back', onclick: onBack },
      h('span.phl-keycap', {}, 'Esc'), backLabel) : null);
}
