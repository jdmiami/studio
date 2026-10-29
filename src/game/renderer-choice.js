// Before anything loads: how the felt world is drawn. "Painted" is the three.js renderer (the
// meshes projection-painted from the artwork); "Soft" is the SDF renderer (src/game/sdf/: the whole
// world raymarched from signed distance fields). The choice can be remembered (settings.renderer)
// and changed later in Settings, Video; ?renderer=threejs|sdf skips the question.
import { ACTIONS } from './core/contracts.js';

export const RENDERERS = ['threejs', 'sdf'];

const CSS = `
.rchoose { position: fixed; inset: 0; z-index: 30; display: flex; align-items: center; justify-content: center; padding: 16px;
  background: radial-gradient(circle at 50% 40%, #f8e9df, #e6c6b8); font-family: Nunito, 'Trebuchet MS', system-ui, sans-serif; color: #6b4c42;
  opacity: 0; transition: opacity 0.35s; box-sizing: border-box; overflow: auto; }
.rchoose.on { opacity: 1; }
.rchoose * { box-sizing: border-box; }
.rchoose-panel { width: min(760px, 100%); display: flex; flex-direction: column; align-items: center; gap: 18px; }
.rchoose-logo { font-size: clamp(34px, 7vw, 54px); font-weight: 900; letter-spacing: 2px; color: #f3b3bd; -webkit-text-stroke: 2px #fff6ee; }
.rchoose-q { font-size: clamp(16px, 3.2vw, 21px); font-weight: 900; text-align: center; }
.rchoose-cards { display: flex; gap: 18px; width: 100%; justify-content: center; }
@media (max-width: 560px) { .rchoose-cards { flex-direction: column; align-items: stretch; } }
.rchoose-card { flex: 1 1 0; max-width: 340px; border: none; cursor: pointer; text-align: left; font-family: inherit; color: inherit;
  border-radius: 22px; padding: 16px 18px 18px; background: #fff7ef; position: relative;
  box-shadow: 0 6px 0 #dcbfae, 0 14px 26px rgba(90, 55, 45, 0.18); transition: transform 0.12s, box-shadow 0.12s; }
@media (max-width: 560px) { .rchoose-card { max-width: none; display: flex; gap: 14px; align-items: center; padding: 12px 14px; } }
.rchoose-card::after { content: ''; position: absolute; inset: 7px; border-radius: 16px; border: 2px dashed rgba(180, 140, 125, 0.45); pointer-events: none; }
.rchoose-card:hover, .rchoose-card.focus { transform: translateY(-3px); box-shadow: 0 9px 0 #dcbfae, 0 18px 30px rgba(90, 55, 45, 0.22), 0 0 0 4px #ffd27a; }
.rchoose-card:active { transform: translateY(2px); }
.rchoose-art { height: 110px; border-radius: 14px; margin-bottom: 12px; position: relative; overflow: hidden; }
@media (max-width: 560px) { .rchoose-art { width: 92px; height: 92px; flex: none; margin: 0; } }
.rchoose-art.painted { background: linear-gradient(180deg, #bcd9f2, #f6e3d6); }
.rchoose-art.painted i { position: absolute; width: 46px; height: 46px; border-radius: 9px; background: #e4b9ab; box-shadow: inset -6px -8px 0 #cf9f90, inset 4px 4px 0 #f2d1c6; }
.rchoose-art.painted i:nth-child(1) { left: 22%; bottom: 14%; } .rchoose-art.painted i:nth-child(2) { left: 46%; bottom: 14%; }
.rchoose-art.painted i:nth-child(3) { left: 34%; bottom: 52%; background: #a9c49a; box-shadow: inset -6px -8px 0 #8faa80, inset 4px 4px 0 #c2d9b4; }
.rchoose-art.soft { background: radial-gradient(circle at 70% 25%, #fff3dc, #f3dfe9 45%, #d9cdee); }
.rchoose-art.soft i { position: absolute; border-radius: 50%; filter: blur(0.4px); }
.rchoose-art.soft i:nth-child(1) { width: 70px; height: 52px; left: 18%; bottom: 10%; background: radial-gradient(circle at 35% 30%, #f6d3c8, #d9a596); }
.rchoose-art.soft i:nth-child(2) { width: 56px; height: 56px; left: 46%; bottom: 22%; background: radial-gradient(circle at 35% 30%, #d3e8c6, #96b986); }
.rchoose-art.soft i:nth-child(3) { width: 30px; height: 30px; left: 30%; bottom: 48%; background: radial-gradient(circle at 35% 30%, #f8e6b8, #e2c07a); }
.rchoose-name { font-size: 20px; font-weight: 900; }
.rchoose-tag { display: inline-block; margin-left: 6px; font-size: 11px; font-weight: 900; letter-spacing: 1px; padding: 2px 8px; border-radius: 8px; background: #f1e1d5; vertical-align: middle; }
.rchoose-desc { margin-top: 6px; font-size: 14px; font-weight: 700; line-height: 1.4; opacity: 0.85; }
.rchoose-foot { display: flex; flex-direction: column; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; opacity: 0.85; text-align: center; }
.rchoose-remember { display: flex; gap: 8px; align-items: center; cursor: pointer; font-weight: 800; opacity: 1; }
.rchoose-remember input { width: 18px; height: 18px; accent-color: #e98fa0; }
`;

/**
 * Resolves the renderer to use: the URL's ?renderer=, else a remembered setting, else asks.
 * onRemember(choice) is called when the player ticks "remember".
 */
export function chooseRenderer({ setting = 'ask', params = new URLSearchParams(location.search), onRemember = () => {}, heavyHint = false } = {}) {
  const forced = params.get('renderer');
  if (RENDERERS.includes(forced)) return { promise: Promise.resolve(forced), handle: () => false, get open() { return false; } };
  if (RENDERERS.includes(setting)) return { promise: Promise.resolve(setting), handle: () => false, get open() { return false; } };

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const el = document.createElement('div');
  el.className = 'rchoose';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Choose how the world is drawn');
  el.innerHTML = `<div class="rchoose-panel">
      <div class="rchoose-logo">Phluph</div>
      <div class="rchoose-q">How should the felt world be drawn?</div>
      <div class="rchoose-cards">
        <button class="rchoose-card" data-choice="threejs">
          <div class="rchoose-art painted"><i></i><i></i><i></i></div>
          <div><div class="rchoose-name">Painted <span class="rchoose-tag">THREE.JS</span></div>
          <div class="rchoose-desc">Felt models painted from the artwork: every block, tree and door matched to the original picture.</div></div>
        </button>
        <button class="rchoose-card" data-choice="sdf">
          <div class="rchoose-art soft"><i></i><i></i><i></i></div>
          <div><div class="rchoose-name">Soft <span class="rchoose-tag">SDF</span></div>
          <div class="rchoose-desc">The whole world raymarched from signed distance fields: pillowy blocks, blended shapes, real soft shadows.${heavyHint ? ' Heavier on phones.' : ''}</div></div>
        </button>
      </div>
      <div class="rchoose-foot">
        <label class="rchoose-remember"><input type="checkbox" /> Remember my choice</label>
        <div>You can switch any time in Settings, Video.</div>
      </div>
    </div>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('on'));
  const cards = [...el.querySelectorAll('.rchoose-card')];
  let focus = 0;
  const show = () => cards.forEach((c, i) => c.classList.toggle('focus', i === focus));
  show();

  let done;
  const promise = new Promise((resolve) => { done = resolve; });
  let open = true;
  function choose(choice) {
    if (!open) return;
    open = false;
    if (el.querySelector('input').checked) onRemember(choice);
    el.classList.remove('on');
    setTimeout(() => { el.remove(); style.remove(); }, 380);
    done(choice);
  }
  cards.forEach((c, i) => {
    c.addEventListener('click', () => choose(c.dataset.choice));
    c.addEventListener('pointerenter', () => { focus = i; show(); });
  });
  return {
    promise,
    get open() { return open; },
    /** A UI action from the input layer (keys, pad); true when consumed. */
    handle(action) {
      if (!open) return false;
      if (action === ACTIONS.UI_LEFT || action === ACTIONS.UI_UP) { focus = 0; show(); return true; }
      if (action === ACTIONS.UI_RIGHT || action === ACTIONS.UI_DOWN) { focus = 1; show(); return true; }
      if (action === ACTIONS.UI_CONFIRM) { choose(cards[focus].dataset.choice); return true; }
      return false;
    },
  };
}
