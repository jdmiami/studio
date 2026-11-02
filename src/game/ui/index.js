// Phluph's menus and overlays (DOM, no framework). One screen stack (title, slots, pause, settings,
// journal, collection, credits, modal dialogs), plus three overlays that live outside the stack:
// the dialogue panel, toasts and the decorate hint bar. The game feeds input in through
// handleAction(ACTIONS.*) and reacts to UI_* events; see README.md for the full contract.
import { ACTIONS, EVENTS, defaultSettings } from '../core/contracts.js';
import { ITEMS, RARITY } from '../data/items.js';
import { injectStyles } from './styles.js';
import { h, getControl } from './dom.js';
import { glyph } from './glyphs.js';
import { actionToDir, navigate } from './logic.js';
import { createDialogue } from './dialogue.js';
import { createToasts } from './toasts.js';
import { createDecorate } from './decorate.js';
import modal from './screens/modal.js';
import title from './screens/title.js';
import slots from './screens/slots.js';
import pause from './screens/pause.js';
import settings from './screens/settings.js';
import journal from './screens/journal.js';
import collection from './screens/collection.js';
import credits from './screens/credits.js';

export const SCREENS = { title, slots, pause, settings, journal, collection, credits, modal };

const NOOP_EVENTS = { emit() {}, on() { return () => {}; } };
const TOGGLE_ACTIONS = new Set([ACTIONS.UI_BACK, ACTIONS.PAUSE, ACTIONS.JOURNAL, ACTIONS.COLLECTION]);
const DEBOUNCE_MS = 120; // one key mapped to two actions (Esc -> pause + back) must not open-then-close
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const isTextField = (el) => !!el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['button', 'checkbox', 'radio', 'range'].includes(el.type)));
const clone = (o) => (typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o)));

/**
 * @param {object} o
 * @param {HTMLElement} [o.root] where the UI mounts (default document.body)
 * @param {{ emit, on }} [o.events] the game's event bus
 * @param {() => object|null} [o.getState] the current save state (null on the title screen)
 * @param {() => object} [o.getSettings] current settings (see defaultSettings())
 * @param {object} [o.actions] callbacks into the game (see README)
 * @param {Array} [o.questCatalogue] [{ id, title, giver, description, steps: [{ id, text }] }]
 * @param {object} [o.screens] extra / replacement screen definitions { name: { create(ctx, params), modal? } }
 * @param {boolean} [o.autoTick] run an internal rAF ticker until the game first calls update(dt)
 */
export function createUI({
  root = document.body, events = NOOP_EVENTS, getState = () => null, getSettings, actions = {},
  questCatalogue = [], screens = {}, items = ITEMS, autoTick = true, version = 'v0.1',
} = {}) {
  injectStyles(root.ownerDocument ?? document);
  const registry = { ...SCREENS, ...screens };
  const emit = (type, payload) => { try { events?.emit?.(type, payload); } catch (e) { console.error(e); } };

  const el = h('div.phl-ui', { 'data-phluph-ui': true });
  const layers = {
    decorate: h('div.phl-layer-decorate'), dialogue: h('div.phl-layer-dialogue'),
    screens: h('div.phl-layer-screens'), toasts: h('div.phl-layer-toasts'),
  };
  el.append(layers.decorate, layers.dialogue, layers.screens, layers.toasts);
  root.appendChild(el);

  let catalogue = questCatalogue;
  let localSettings = null;
  let capturing = false;
  let suppressUntil = 0;
  let lastStackChange = -Infinity;
  let hudEl = null;
  const stack = [];

  const settingsNow = () => clone(localSettings ?? getSettings?.() ?? defaultSettings());
  function applyScale(s) { el.style.setProperty('--scale', String(s?.uiScale ?? 1)); }
  applyScale(getSettings?.());

  // ------------------------------------------------------------------ focus
  function focusables(entry) {
    return [...entry.el.querySelectorAll('[data-focus]')].filter((f) => !f.disabled
      && f.getAttribute('aria-disabled') !== 'true' && f.getClientRects().length > 0 && !f.closest('[inert]'));
  }

  function setFocus(entry, target, { silent = false, source = 'nav', scroll = true } = {}) {
    if (!entry?.el || !entry.inst) return;
    const prev = entry.focus;
    if (prev === target) { target?.classList.add('phl-focus'); return; }
    prev?.classList.remove('phl-focus');
    if (prev && isTextField(prev) && prev !== target) prev.blur();
    entry.focus = target ?? null;
    entry.focusKey = target?.dataset.key ?? null;
    if (!target) return;
    target.classList.add('phl-focus');
    if (isTextField(target)) target.focus({ preventScroll: true });
    if (scroll && source !== 'pointer') target.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    entry.inst.onFocus?.(target, source);
    if (!silent) emit(EVENTS.UI_MOVE, { screen: entry.name, source });
  }

  /** Keeps (or restores) a sensible focus after open / re-render / pop. */
  function ensureFocus(entry, { silent = true } = {}) {
    if (!entry?.el || !entry.inst) return; // still inside create(); open() focuses once it returns
    const list = focusables(entry);
    let target = entry.focus && entry.focus.isConnected && list.includes(entry.focus) ? entry.focus : null;
    if (!target && entry.focusKey) target = list.find((f) => f.dataset.key === entry.focusKey) ?? null;
    if (!target) target = entry.inst.initialFocus?.() ?? list.find((f) => f.hasAttribute('data-autofocus')) ?? list[0] ?? null;
    if (target && entry.focus && entry.focus !== target) entry.focus.classList.remove('phl-focus');
    if (target === entry.focus) { target?.classList.add('phl-focus'); return; }
    entry.focus = null;
    setFocus(entry, target, { silent, source: 'auto', scroll: false });
  }

  function moveFocus(entry, dir) {
    const list = focusables(entry);
    if (!list.length) return false;
    const idx = list.indexOf(entry.focus);
    const rects = list.map((f) => {
      const r = f.getBoundingClientRect();
      const g = f.closest('[data-focus-group]');
      return { x: r.left, y: r.top, w: r.width, h: r.height, group: g?.dataset.focusGroup, wrap: g?.dataset.focusWrap };
    });
    const ni = navigate(rects, idx, dir, { wrap: entry.inst.wrap ?? true });
    if (ni < 0 || list[ni] === entry.focus) return false;
    setFocus(entry, list[ni]);
    return true;
  }

  function activate(entry) {
    const f = entry.focus;
    if (!f || f.disabled) return false;
    const ctl = getControl(f);
    if (ctl?.activate) { if (ctl.activate() !== false) emit(EVENTS.UI_CONFIRM, { screen: entry.name }); return true; }
    if (isTextField(f)) { submitField(entry, f); return true; }
    f.click(); // the delegated click listener emits UI_CONFIRM
    return true;
  }

  function submitField(entry, field) {
    if (entry.inst.onSubmit?.(field)) return;
    const primary = entry.el.querySelector('[data-primary]:not([disabled])');
    if (primary) { setFocus(entry, primary, { silent: true }); primary.click(); }
  }

  // Pointer: hover moves focus (one highlight for mouse and pad), clicks make the confirm sound.
  layers.screens.addEventListener('pointermove', (e) => {
    const top = stack.at(-1);
    const f = e.target.closest?.('[data-focus]');
    if (!top || !f || !top.el.contains(f) || f.disabled || f.closest('[inert]')) return;
    setFocus(top, f, { source: 'pointer' });
  });
  layers.screens.addEventListener('click', (e) => {
    const top = stack.at(-1);
    const f = e.target.closest?.('[data-focus]');
    if (top && f && top.el.contains(f) && !f.disabled && !isTextField(f)) emit(EVENTS.UI_CONFIRM, { screen: top.name });
  });
  // Buttons never take DOM focus (so a native Enter/Space can't double-activate them).
  layers.screens.addEventListener('mousedown', (e) => {
    if (e.target.closest?.('button, [role="slider"]')) e.preventDefault();
  });
  // Text fields: keys are typed, not navigated; Enter submits, Esc backs out, Up/Down leave the field.
  layers.screens.addEventListener('keydown', (e) => {
    const top = stack.at(-1);
    if (!top || !isTextField(e.target)) return;
    const handled = { Enter: () => { if (e.target.tagName === 'TEXTAREA' && e.shiftKey) return false; submitField(top, e.target); return true; },
      Escape: () => { back(); return true; },
      ArrowUp: () => moveFocus(top, 'up'), ArrowDown: () => moveFocus(top, 'down'), Tab: () => moveFocus(top, e.shiftKey ? 'up' : 'down') }[e.key];
    if (handled && handled() !== false) { e.preventDefault(); e.stopPropagation(); suppressUntil = now() + 60; }
  });

  // ------------------------------------------------------------------ stack
  function entryCtx(entry) {
    return Object.assign(Object.create(ctx), {
      entry,
      refocus: () => ensureFocus(entry),
      focus: (target, opts) => setFocus(entry, target, opts),
      focused: () => entry.focus,
    });
  }

  function open(name, params = {}) {
    const def = registry[name];
    if (!def) throw new Error(`[ui] unknown screen "${name}"`);
    const wasEmpty = stack.length === 0;
    const prev = stack.at(-1);
    const entry = { name, params, def, focus: null, focusKey: null };
    entry.inst = def.create(entryCtx(entry), params);
    entry.el = entry.inst.el;
    entry.el.classList.add('phl-screen', `phl-screen-${name}`);
    if (def.scrim ?? entry.inst.scrim) entry.el.classList.add('is-scrim');
    if (prev) {
      if (def.modal) { prev.el.classList.add('is-under'); prev.el.inert = true; } else prev.el.classList.add('is-hidden');
    }
    layers.screens.appendChild(entry.el);
    stack.push(entry);
    lastStackChange = now();
    ensureFocus(entry);
    if (hudEl) hudEl.style.visibility = 'hidden';
    if (wasEmpty && name !== 'title' && getState()) actions.pause?.();
    emit(EVENTS.UI_OPEN, { screen: name });
    return entry.inst;
  }

  function removeEntry(entry) {
    entry.inst.destroy?.();
    entry.el.classList.add('is-leaving');
    entry.el.classList.remove('is-hidden');
    setTimeout(() => entry.el.remove(), 190);
    emit(EVENTS.UI_CLOSE, { screen: entry.name });
  }

  function reveal(entry) {
    entry.el.classList.remove('is-hidden', 'is-under');
    entry.el.inert = false;
    entry.inst.refresh?.();
    ensureFocus(entry);
  }

  /** Pops the top screen. When the stack empties (back to gameplay), calls actions.resume(). */
  function pop({ silent = false } = {}) {
    const entry = stack.pop();
    if (!entry) return false;
    lastStackChange = now();
    removeEntry(entry);
    const below = stack.at(-1);
    if (below) reveal(below);
    else {
      if (hudEl) hudEl.style.visibility = '';
      if (!silent) actions.resume?.();
    }
    return true;
  }

  function back() {
    const top = stack.at(-1);
    if (!top) return false;
    emit(EVENTS.UI_BACK, { screen: top.name });
    if (top.inst.onBack?.()) return true;
    return pop();
  }

  /** Closes every screen (back to gameplay; resumes unless silent). */
  function close({ silent = false } = {}) {
    if (!stack.length) return;
    while (stack.length > 1) removeEntry(stack.pop());
    pop({ silent });
  }

  /** Replaces the whole stack with one screen (e.g. back to the title) without resuming. */
  function reset(name, params) {
    while (stack.length) removeEntry(stack.pop());
    lastStackChange = now();
    if (name) return open(name, params);
    if (hudEl) hudEl.style.visibility = '';
    return null;
  }

  // ------------------------------------------------------------------ overlays
  const toasts = createToasts({ layer: layers.toasts, items });
  const toast = (text, kind = 'info', opts = {}) => toasts.show(text, kind, opts);
  const offToast = events?.on?.(EVENTS.TOAST, (p) => p?.text && toast(p.text, p.kind ?? 'info', p));
  const dialogue = createDialogue({ layer: layers.dialogue, emit });
  const decorate = createDecorate({ layer: layers.decorate, items, labelFor: (a) => actions.labelFor?.(a) });

  // ------------------------------------------------------------------ shared screen context
  function modalPromise(params) {
    return new Promise((resolve) => open('modal', { ...params, resolve }));
  }
  const ctx = {
    get ui() { return api; },
    actions, events, emit, getState, items, RARITY, glyph, version,
    catalogue: () => catalogue,
    settings: settingsNow,
    applySettings(next) {
      localSettings = clone(next);
      applyScale(next);
      try { actions.applySettings?.(clone(next)); } catch (e) { console.error(e); }
      emit(EVENTS.SETTINGS_CHANGED, { settings: clone(next) });
    },
    setCapturing(on) { capturing = !!on; },
    open, back, pop, close, reset, toast,
    confirm: (o) => modalPromise({ kind: 'confirm', ...o }),
    prompt: (o) => modalPromise({ kind: 'prompt', ...o }),
    showCode: (o) => modalPromise({ kind: 'code', ...o }),
    /** Runs a game action (sync or async); errors become a toast. started: the game is now running. */
    async run(fn, { started = false } = {}) {
      const before = [...stack];
      try {
        const r = await fn();
        if (started) {
          for (const e of before) { const i = stack.indexOf(e); if (i >= 0) { stack.splice(i, 1); removeEntry(e); } }
          if (stack.length) reveal(stack.at(-1)); else if (hudEl) hudEl.style.visibility = '';
          lastStackChange = now();
        }
        return r;
      } catch (e) {
        console.error(e);
        toast(e?.message ? `Oh no: ${e.message}` : 'Something went wrong', 'error');
        throw e;
      }
    },
    async quitToTitle() {
      try { await actions.quitToTitle?.(); } catch (e) { console.error(e); }
      reset('title');
    },
  };

  // ------------------------------------------------------------------ input
  /**
   * Feed one input action (ACTIONS.*). opts.device: 'keyboard' | 'gamepad' | 'mouse' (text fields
   * ignore keyboard-sourced actions so typing "w" doesn't move focus). Returns true if consumed.
   */
  function handleAction(action, opts = {}) {
    const t = now();
    if (capturing) return true;
    const top = stack.at(-1);
    if (top) {
      if (t < suppressUntil) return true;
      const active = el.ownerDocument.activeElement;
      if (isTextField(active) && top.el.contains(active) && opts.device !== 'gamepad') return true;
      if (TOGGLE_ACTIONS.has(action) && t - lastStackChange < DEBOUNCE_MS) return true;
      if (top.inst.onAction?.(action, opts)) return true;
      const dir = actionToDir(action);
      if (dir) {
        const ctl = getControl(top.focus);
        if ((dir === 'left' || dir === 'right') && ctl?.adjust) {
          if (ctl.adjust(dir === 'left' ? -1 : 1)) emit(EVENTS.UI_MOVE, { screen: top.name, source: 'adjust' });
          return true;
        }
        moveFocus(top, dir);
        return true;
      }
      switch (action) {
        case ACTIONS.UI_CONFIRM: activate(top); return true;
        case ACTIONS.UI_BACK: case ACTIONS.PAUSE: back(); return true;
        case ACTIONS.JOURNAL: if (top.name === 'journal') back(); return true;
        case ACTIONS.COLLECTION: if (top.name === 'collection') back(); return true;
        case ACTIONS.UI_TAB_PREV: top.inst.tab?.(-1); return true;
        case ACTIONS.UI_TAB_NEXT: top.inst.tab?.(1); return true;
        default: return true; // menus swallow gameplay input
      }
    }
    if (dialogue.active && dialogue.handle(action)) return true;
    if (TOGGLE_ACTIONS.has(action) && t - lastStackChange < DEBOUNCE_MS) return true;
    if (!getState()) return false;
    if (action === ACTIONS.PAUSE) { open('pause'); return true; }
    if (action === ACTIONS.JOURNAL) { open('journal'); return true; }
    if (action === ACTIONS.COLLECTION) { open('collection'); return true; }
    return false;
  }

  // ------------------------------------------------------------------ ticking
  let external = false;
  let raf = 0;
  let last = now();
  function step(dt) {
    dialogue.update(dt);
    toasts.update(dt);
    stack.at(-1)?.inst.update?.(dt);
  }
  function tick(t) {
    if (external) return;
    step(Math.min(0.1, Math.max(0, (t - last) / 1000)));
    last = t;
    raf = requestAnimationFrame(tick);
  }
  if (autoTick && typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(tick);

  const api = {
    el,
    open, close, back, reset, top: () => stack.at(-1)?.name ?? null, isOpen: () => stack.length > 0,
    stack: () => stack.map((e) => e.name),
    handleAction,
    dialogue: { show: (o) => dialogue.show(o), hide: () => dialogue.hide(), get active() { return dialogue.active; } },
    toast,
    showDecorate: (o) => decorate.show(o), hideDecorate: () => decorate.hide(),
    confirm: ctx.confirm, prompt: ctx.prompt, showCode: ctx.showCode,
    setQuestCatalogue(list) { catalogue = Array.isArray(list) ? list : []; refresh(); },
    /** Re-render the top screen from getState() (e.g. after a find while the book is open). */
    refresh,
    /** Hide this HUD element while a menu screen is open. */
    setHud(hud) { hudEl = hud?.el ?? hud ?? null; if (hudEl) hudEl.style.visibility = stack.length ? 'hidden' : ''; },
    /** Advance typewriter / animations; the first call switches off the internal ticker. */
    update(dt) { if (!external) { external = true; cancelAnimationFrame?.(raf); } step(dt); },
    destroy() { external = true; cancelAnimationFrame?.(raf); offToast?.(); reset(null); el.remove(); },
  };
  function refresh() { const top = stack.at(-1); if (top) { top.inst.refresh?.(); ensureFocus(top); } }
  return api;
}

export { attachInputBridge } from './input-bridge.js';
