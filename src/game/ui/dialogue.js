// The dialogue overlay: a bottom felt panel with a speaker name tag (and portrait colour dot),
// typewriter text (confirm skips to the end) and an optional choice list (up/down + confirm, or
// mouse). show() resolves with the chosen index, or null for a line without choices / a cancel.
import { ACTIONS, EVENTS } from '../core/contracts.js';
import { h, esc } from './dom.js';
import { listStep, speakerColor, typewriterCount } from './logic.js';

const AUTO_HIDE_MS = 70; // lines chained with await show() never flicker; a forgotten hide() still hides

export function createDialogue({ layer, emit = () => {} }) {
  const dot = h('span.phl-dlg-dot');
  const name = h('span.phl-dlg-name');
  const tag = h('div.phl-dlg-tag', {}, dot, name);
  const text = h('div.phl-dlg-text', { 'aria-live': 'polite' });
  const choicesEl = h('div.phl-dlg-choices');
  const next = h('div.phl-dlg-next', {}, 'Continue', h('i'));
  const panel = h('div.phl-dialogue.phl-panel.is-hidden', { role: 'dialog' }, tag, text, choicesEl, next);
  layer.appendChild(panel);

  let cur = null; // { text, choices, elapsed, shown, resolve, index, cps }
  let hideTimer = 0;

  function paintText() {
    const shown = cur.text.slice(0, cur.shown);
    text.innerHTML = `<span>${esc(shown)}</span><span class="rest">${esc(cur.text.slice(cur.shown))}</span>`;
    const done = cur.shown >= cur.text.length;
    choicesEl.style.visibility = done ? '' : 'hidden';
    next.classList.toggle('is-on', done && !cur.choices.length);
  }

  function paintChoices() {
    [...choicesEl.children].forEach((c, i) => c.classList.toggle('is-active', i === cur.index));
  }

  function finish(value) {
    if (!cur) return;
    const { resolve } = cur;
    cur = null;
    emit(EVENTS.UI_CONFIRM, { screen: 'dialogue' });
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { if (!cur) hide(); }, AUTO_HIDE_MS);
    resolve(value);
  }

  function skipOrAdvance() {
    if (!cur) return;
    if (cur.shown < cur.text.length) { cur.shown = cur.text.length; paintText(); return; }
    if (cur.choices.length) finish(cur.index);
    else finish(null);
  }

  panel.addEventListener('click', (e) => {
    const c = e.target.closest('.phl-dlg-choice');
    if (c && cur && cur.shown >= cur.text.length) { finish(Number(c.dataset.index)); return; }
    if (!c) skipOrAdvance();
  });
  panel.addEventListener('pointermove', (e) => {
    const c = e.target.closest('.phl-dlg-choice');
    if (c && cur && Number(c.dataset.index) !== cur.index) { cur.index = Number(c.dataset.index); paintChoices(); }
  });

  /**
   * show({ speaker, text, choices?: string[] | [{ text }], color?, cps? }) → Promise<index | null>.
   * A newer show() resolves a pending one with null.
   */
  function show({ speaker = '', text: body = '', choices = [], color, cps = 48 } = {}) {
    if (cur) { const r = cur.resolve; cur = null; r(null); }
    clearTimeout(hideTimer);
    const list = (choices ?? []).map((c) => (typeof c === 'string' ? c : c?.text ?? String(c)));
    return new Promise((resolve) => {
      cur = { text: String(body), choices: list, elapsed: 0, shown: 0, resolve, index: 0, cps };
      name.textContent = speaker;
      tag.style.display = speaker ? '' : 'none';
      dot.style.setProperty('--c', color ?? speakerColor(speaker));
      choicesEl.innerHTML = '';
      list.forEach((c, i) => choicesEl.appendChild(h('button.phl-dlg-choice', { type: 'button', 'data-index': i }, c)));
      paintChoices();
      paintText();
      const wasHidden = panel.classList.contains('is-hidden');
      panel.classList.remove('is-hidden');
      if (wasHidden) emit(EVENTS.UI_OPEN, { screen: 'dialogue' });
    });
  }

  function hide() {
    clearTimeout(hideTimer);
    if (cur) { const r = cur.resolve; cur = null; r(null); }
    if (!panel.classList.contains('is-hidden')) {
      panel.classList.add('is-hidden');
      emit(EVENTS.UI_CLOSE, { screen: 'dialogue' });
    }
  }

  /** Input while the dialogue is up; returns true when consumed. */
  function handle(action) {
    if (!cur) return false;
    switch (action) {
      case ACTIONS.UI_CONFIRM: case ACTIONS.INTERACT: case ACTIONS.JUMP:
        skipOrAdvance(); return true;
      case ACTIONS.UI_UP: case ACTIONS.UI_DOWN:
        if (cur.choices.length && cur.shown >= cur.text.length) {
          const ni = listStep(cur.choices.length, cur.index, action === ACTIONS.UI_UP ? -1 : 1, true);
          if (ni !== cur.index) { cur.index = ni; paintChoices(); emit(EVENTS.UI_MOVE, { screen: 'dialogue' }); }
        }
        return true;
      case ACTIONS.UI_BACK:
        if (cur.shown < cur.text.length) skipOrAdvance();
        else if (cur.choices.length) { emit(EVENTS.UI_BACK, { screen: 'dialogue' }); finish(null); } else finish(null);
        return true;
      case ACTIONS.UI_LEFT: case ACTIONS.UI_RIGHT:
        return true;
      default: return false;
    }
  }

  function update(dt) {
    if (!cur || cur.shown >= cur.text.length) return;
    cur.elapsed += dt;
    const n = typewriterCount(cur.text.length, cur.elapsed, cur.cps);
    if (n !== cur.shown) { cur.shown = n; paintText(); }
  }

  return { show, hide, handle, update, get active() { return !!cur; }, el: panel };
}
