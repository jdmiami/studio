// The felt lock's overlay: the great door's three wool dials up close. Left/right picks a dial,
// up/down turns it, confirm pulls the lever, back steps away. Driven by the game with UI actions
// (keyboard, gamepad) and clickable too; the lock's logic is src/game/play/puzzles.js.
import { ACTIONS, EVENTS } from './core/contracts.js';
import { LOCK_COLORS } from './play/puzzles.js';
import { t } from './play/strings.js';

const CSS = `
.flock { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 12;
  background: radial-gradient(circle at 50% 50%, rgba(60, 40, 36, 0.25), rgba(40, 26, 24, 0.6)); font-family: Nunito, 'Trebuchet MS', system-ui, sans-serif;
  color: #fff8ef; opacity: 0; transition: opacity 0.25s; }
.flock.on { opacity: 1; }
.flock-panel { position: relative; padding: 28px 36px 24px; border-radius: 26px; background: #b99a8c; box-shadow: 0 18px 40px rgba(40, 24, 20, 0.45), inset 0 0 0 4px #a68779;
  display: flex; flex-direction: column; align-items: center; gap: 18px; max-width: 92vw; }
.flock-panel::after { content: ''; position: absolute; inset: 9px; border: 2px dashed rgba(255, 244, 232, 0.5); border-radius: 19px; pointer-events: none; }
.flock-title { font-size: 22px; font-weight: 900; letter-spacing: 1.5px; text-shadow: 0 2px 0 rgba(90, 60, 50, 0.4); }
.flock-dials { display: flex; gap: 22px; }
.flock-dial { display: flex; flex-direction: column; align-items: center; gap: 8px; cursor: pointer; }
.flock-arrow { font-size: 20px; font-weight: 900; opacity: 0.6; padding: 0 10px; border-radius: 8px; }
.flock-arrow:hover { opacity: 1; background: rgba(255,255,255,0.15); }
.flock-wool { width: 92px; height: 92px; border-radius: 50%; box-shadow: inset 0 -8px 0 rgba(0,0,0,0.12), inset 0 6px 0 rgba(255,255,255,0.25), 0 4px 0 #8f7266;
  display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 900; color: #5b4139; text-shadow: none; transition: background 0.2s, transform 0.2s; }
.flock-wool::before { content: ''; width: 64px; height: 64px; border-radius: 50%; border: 2px dashed rgba(255,255,255,0.6); position: absolute; }
.flock-dial.sel .flock-wool { transform: scale(1.1); box-shadow: 0 0 0 5px #ffd27a, inset 0 -8px 0 rgba(0,0,0,0.12), 0 4px 0 #8f7266; }
.flock-lever { font-size: 17px; font-weight: 900; padding: 10px 26px; border-radius: 14px; background: #f3b3bd; color: #5b3b3b; text-shadow: none; cursor: pointer;
  box-shadow: 0 4px 0 #c98c96; border: none; font-family: inherit; }
.flock-lever:active { transform: translateY(2px); box-shadow: 0 2px 0 #c98c96; }
.flock-help { font-size: 13px; font-weight: 700; opacity: 0.85; text-align: center; max-width: 420px; }
.flock-panel.shake { animation: flock-shake 0.4s; }
@keyframes flock-shake { 0%,100% { transform: translateX(0); } 20% { transform: translateX(-10px); } 40% { transform: translateX(9px); } 60% { transform: translateX(-6px); } 80% { transform: translateX(4px); } }
`;

export function createLockUi({ events }) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  let el = null;
  let lock = null;
  let onDone = null;

  function render() {
    if (!el) return;
    el.querySelectorAll('.flock-dial').forEach((d, i) => {
      const c = LOCK_COLORS[lock.state.dials[i]];
      d.classList.toggle('sel', i === lock.state.selected);
      const w = d.querySelector('.flock-wool');
      w.style.background = c.hex;
      w.textContent = c.label;
    });
  }

  function close(result) {
    if (!el) return;
    const node = el;
    el = null;
    node.classList.remove('on');
    setTimeout(() => node.remove(), 260);
    events.emit(EVENTS.UI_CLOSE, { screen: 'lock' });
    onDone?.(result);
  }

  function pull() {
    const r = onPull();
    if (r === 'open') { setTimeout(() => close('open'), 500); return; }
    const p = el.querySelector('.flock-panel');
    p.classList.remove('shake');
    void p.offsetWidth;
    p.classList.add('shake');
  }
  let onPull = () => 'wrong';

  return {
    get open() { return !!el; },
    /** Shows the lock; tryLock() pulls the lever (returns 'open' | 'wrong' | 'hint'); resolves on close. */
    show(theLock, tryLock) {
      lock = theLock;
      onPull = tryLock;
      el = document.createElement('div');
      el.className = 'flock';
      el.innerHTML = `<div class="flock-panel">
        <div class="flock-title">The Felt Lock</div>
        <div class="flock-dials">${[0, 1, 2].map((i) => `<div class="flock-dial" data-i="${i}">
          <span class="flock-arrow" data-d="1">▲</span><div class="flock-wool"></div><span class="flock-arrow" data-d="-1">▼</span></div>`).join('')}</div>
        <button class="flock-lever">Pull the lever</button>
        <div class="flock-help">${t('lock.help')}</div></div>`;
      document.body.appendChild(el);
      el.addEventListener('click', (e) => {
        const dial = e.target.closest('.flock-dial');
        if (dial) {
          lock.state.selected = Number(dial.dataset.i);
          const d = e.target.closest('.flock-arrow')?.dataset.d;
          if (d) { lock.turn(Number(d)); events.emit(EVENTS.PUZZLE_TURN, { puzzleId: 'great-door' }); }
          render();
        }
        if (e.target.closest('.flock-lever')) pull();
        if (e.target === el) close('back');
      });
      requestAnimationFrame(() => el?.classList.add('on'));
      events.emit(EVENTS.UI_OPEN, { screen: 'lock' });
      render();
      return new Promise((resolve) => { onDone = resolve; });
    },
    /** A UI action from the input layer; true when consumed. */
    handle(action) {
      if (!el) return false;
      if (action === ACTIONS.UI_LEFT) { lock.select(-1); events.emit(EVENTS.UI_MOVE, {}); }
      else if (action === ACTIONS.UI_RIGHT) { lock.select(1); events.emit(EVENTS.UI_MOVE, {}); }
      else if (action === ACTIONS.UI_UP) { lock.turn(1); events.emit(EVENTS.PUZZLE_TURN, { puzzleId: 'great-door' }); }
      else if (action === ACTIONS.UI_DOWN) { lock.turn(-1); events.emit(EVENTS.PUZZLE_TURN, { puzzleId: 'great-door' }); }
      else if (action === ACTIONS.UI_CONFIRM) pull();
      else if (action === ACTIONS.UI_BACK) close('back');
      else return false;
      render();
      return true;
    },
  };
}
