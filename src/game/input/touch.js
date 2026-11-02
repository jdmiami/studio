// On-screen touch controls, in the HUD's felt style, feeding the input layer's touch source (so the
// game reads the same actions as from keys or a pad):
//
// - a floating stick: a thumb anywhere on the left part of the screen sets its base there; pulling
//   past the rim runs; dragging further slides the base along (touch-math.js)
// - look: dragging anywhere else turns the view (several fingers each drive their own drag)
// - buttons, bottom right: jump (big), interact (shows what it will do: "Talk to Mira"), throw the
//   ball, decorate; in decorate mode: place, turn, next, pick up, done
// - small buttons, top left under the area chip: pause, journal, collection book
//
// Multi-touch by pointer id with pointer capture; touch-action none, so the page never scrolls or
// zooms under a thumb. Light haptics where the browser has navigator.vibrate.
import { ACTIONS } from '../core/contracts.js';
import { STICK, stickVector, followBase, clampBase } from './touch-math.js';
import { TOUCH_GLYPHS } from './labels.js';

const CSS = `
.ptouch { position: fixed; inset: 0; z-index: 6; pointer-events: none; touch-action: none; user-select: none; -webkit-user-select: none;
  -webkit-touch-callout: none; font-family: Nunito, 'Trebuchet MS', system-ui, sans-serif; --s: 1; }
.ptouch[hidden] { display: none; }
.ptouch-look, .ptouch-move { position: absolute; pointer-events: auto; touch-action: none; }
.ptouch-move { left: 0; bottom: 0; width: 46%; height: 72%; }
.ptouch-look { right: 0; top: 0; bottom: 0; left: 0; z-index: -1; }
.ptouch-stick { position: absolute; width: calc(112px * var(--s)); height: calc(112px * var(--s)); margin: calc(-56px * var(--s)) 0 0 calc(-56px * var(--s));
  border-radius: 50%; background: rgba(255, 246, 236, 0.16); box-shadow: inset 0 0 0 3px rgba(255, 246, 236, 0.45); opacity: 0;
  transition: opacity 0.15s, box-shadow 0.15s; pointer-events: none; }
.ptouch-stick::after { content: ''; position: absolute; inset: 9px; border-radius: 50%; border: 2px dashed rgba(255, 246, 236, 0.35); }
.ptouch-stick.on { opacity: 1; }
.ptouch-stick.run { box-shadow: inset 0 0 0 4px #ffd27a, 0 0 18px rgba(255, 210, 122, 0.5); }
.ptouch-knob { position: absolute; left: 50%; top: 50%; width: calc(52px * var(--s)); height: calc(52px * var(--s)); margin: calc(-26px * var(--s)) 0 0 calc(-26px * var(--s));
  border-radius: 50%; background: #fff3e4; box-shadow: 0 3px 0 #d9bfae, 0 6px 14px rgba(60, 40, 34, 0.35); }
.ptouch-hint { position: absolute; left: max(28px, calc(env(safe-area-inset-left) + 20px)); bottom: max(30px, calc(env(safe-area-inset-bottom) + 22px));
  width: calc(112px * var(--s)); height: calc(112px * var(--s)); border-radius: 50%; border: 2px dashed rgba(255, 246, 236, 0.35);
  display: flex; align-items: center; justify-content: center; color: rgba(255, 248, 239, 0.6); font-size: 12px; font-weight: 800;
  letter-spacing: 1px; text-shadow: 0 1px 2px rgba(40, 25, 20, 0.5); transition: opacity 0.3s; }
.ptouch.moving .ptouch-hint { opacity: 0; }
.ptouch-btns { position: absolute; right: max(18px, calc(env(safe-area-inset-right) + 12px)); bottom: max(22px, calc(env(safe-area-inset-bottom) + 14px));
  width: calc(210px * var(--s)); height: calc(210px * var(--s)); pointer-events: none; }
.ptouch-btn { position: absolute; pointer-events: auto; touch-action: none; border: none; border-radius: 50%; padding: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px;
  background: rgba(255, 243, 228, 0.88); color: #6b4c42; font: 800 calc(22px * var(--s))/1 Nunito, 'Trebuchet MS', system-ui, sans-serif;
  box-shadow: 0 4px 0 rgba(150, 110, 96, 0.85), 0 8px 16px rgba(50, 32, 28, 0.3); transition: transform 0.08s, opacity 0.2s, box-shadow 0.08s; }
.ptouch-btn::after { content: ''; position: absolute; inset: 5px; border-radius: 50%; border: 1.5px dashed rgba(150, 110, 96, 0.45); pointer-events: none; }
.ptouch-btn small { font-size: calc(9px * var(--s)); letter-spacing: 0.6px; text-transform: uppercase; opacity: 0.8; }
.ptouch-btn.down { transform: translateY(3px) scale(0.96); box-shadow: 0 1px 0 rgba(150, 110, 96, 0.85), 0 4px 8px rgba(50, 32, 28, 0.25); }
.ptouch-btn.off { opacity: 0.38; }
.ptouch-btn[hidden] { display: none; }
.ptouch-jump { right: 0; bottom: 0; width: calc(84px * var(--s)); height: calc(84px * var(--s)); background: rgba(243, 179, 189, 0.92); color: #5b3b3b; font-size: calc(30px * var(--s)); }
.ptouch-interact { right: calc(96px * var(--s)); bottom: calc(10px * var(--s)); width: calc(66px * var(--s)); height: calc(66px * var(--s)); background: rgba(196, 230, 208, 0.92); color: #3e5a48; }
.ptouch-throw { right: calc(14px * var(--s)); bottom: calc(98px * var(--s)); width: calc(56px * var(--s)); height: calc(56px * var(--s)); }
.ptouch-decorate { right: calc(84px * var(--s)); bottom: calc(86px * var(--s)); width: calc(52px * var(--s)); height: calc(52px * var(--s)); background: rgba(214, 198, 236, 0.92); color: #4e3f66; }
.ptouch-rotate { right: calc(150px * var(--s)); bottom: calc(80px * var(--s)); width: calc(48px * var(--s)); height: calc(48px * var(--s)); }
.ptouch-next { right: calc(30px * var(--s)); bottom: calc(160px * var(--s)); width: calc(48px * var(--s)); height: calc(48px * var(--s)); }
.ptouch-pickup { right: calc(170px * var(--s)); bottom: calc(14px * var(--s)); width: calc(48px * var(--s)); height: calc(48px * var(--s)); }
.ptouch-say { position: absolute; right: calc(80px * var(--s)); bottom: calc(84px * var(--s)); max-width: 46vw; padding: 6px 12px; border-radius: 10px;
  background: rgba(48, 36, 32, 0.66); color: #fff8ef; font-size: 14px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  opacity: 0; transform: translateY(4px); transition: opacity 0.2s, transform 0.2s; pointer-events: none; }
.ptouch-say.on { opacity: 1; transform: none; }
.ptouch-menu { position: absolute; left: max(14px, calc(env(safe-area-inset-left) + 8px)); top: calc(max(14px, env(safe-area-inset-top)) + 46px);
  display: flex; gap: 8px; pointer-events: none; }
.ptouch-menu .ptouch-btn { position: relative; width: 42px; height: 42px; font-size: 17px; border-radius: 13px; box-shadow: 0 3px 0 rgba(150, 110, 96, 0.8); }
.ptouch-menu .ptouch-btn::after { border-radius: 9px; inset: 4px; }
`;

function haptic(ms = 8) { try { globalThis.navigator?.vibrate?.(ms); } catch { /* ignore */ } }

/**
 * @param {{ input, root?: HTMLElement, getSettings?: () => object, onNext?: () => void }} o
 * input: the input layer (its .touch source); onNext: the decorate "next item" button.
 */
export function createTouchControls({ input, root = document.body, getSettings = () => ({}), onNext = () => {} }) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const el = document.createElement('div');
  el.className = 'ptouch';
  el.hidden = true;
  el.innerHTML = `
    <div class="ptouch-look"></div>
    <div class="ptouch-move"></div>
    <div class="ptouch-hint">MOVE</div>
    <div class="ptouch-stick"><div class="ptouch-knob"></div></div>
    <div class="ptouch-menu">
      <button class="ptouch-btn" data-action="${ACTIONS.PAUSE}" aria-label="Pause">${TOUCH_GLYPHS.pause}</button>
      <button class="ptouch-btn" data-action="${ACTIONS.JOURNAL}" aria-label="Journal">${TOUCH_GLYPHS.journal}</button>
      <button class="ptouch-btn" data-action="${ACTIONS.COLLECTION}" aria-label="Collection book">${TOUCH_GLYPHS.collection}</button>
    </div>
    <div class="ptouch-btns">
      <div class="ptouch-say"></div>
      <button class="ptouch-btn ptouch-jump" data-action="${ACTIONS.JUMP}" aria-label="Jump">${TOUCH_GLYPHS.jump}</button>
      <button class="ptouch-btn ptouch-interact off" data-action="${ACTIONS.INTERACT}" aria-label="Interact">${TOUCH_GLYPHS.interact}<small>use</small></button>
      <button class="ptouch-btn ptouch-throw" data-action="${ACTIONS.THROW}" aria-label="Throw the ball" hidden>${TOUCH_GLYPHS.throw}<small>throw</small></button>
      <button class="ptouch-btn ptouch-decorate" data-action="${ACTIONS.DECORATE}" aria-label="Decorate" hidden>${TOUCH_GLYPHS.decorate}<small>nest</small></button>
      <button class="ptouch-btn ptouch-rotate" data-action="${ACTIONS.ROTATE}" aria-label="Turn" hidden>${TOUCH_GLYPHS.rotate}<small>turn</small></button>
      <button class="ptouch-btn ptouch-next" data-next="1" aria-label="Next item" hidden>›<small>next</small></button>
      <button class="ptouch-btn ptouch-pickup" data-action="${ACTIONS.PICK_UP}" aria-label="Pick up" hidden>${TOUCH_GLYPHS.pickUp}<small>take</small></button>
    </div>`;
  root.appendChild(el);
  const $ = (s) => el.querySelector(s);
  const stick = $('.ptouch-stick');
  const knob = $('.ptouch-knob');
  const say = $('.ptouch-say');
  const btn = {
    interact: $('.ptouch-interact'), throw: $('.ptouch-throw'), decorate: $('.ptouch-decorate'),
    rotate: $('.ptouch-rotate'), next: $('.ptouch-next'), pickup: $('.ptouch-pickup'),
  };

  const scale = () => Math.min(1.6, Math.max(0.7, getSettings().touchButtonScale ?? 1));
  const radius = () => STICK.radius * scale();
  const insets = () => {
    const cs = getComputedStyle(el);
    const v = (k) => parseFloat(cs.getPropertyValue(k)) || 0;
    return { left: v('--sal'), right: v('--sar'), top: v('--sat'), bottom: v('--sab') };
  };
  el.style.cssText = '--sal: env(safe-area-inset-left); --sar: env(safe-area-inset-right); --sat: env(safe-area-inset-top); --sab: env(safe-area-inset-bottom);';

  // ---- the stick ----------------------------------------------------------------------------
  let movePointer = null;
  let base = { x: 0, y: 0 };
  let running = false;
  function placeStick() {
    stick.style.left = `${base.x}px`;
    stick.style.top = `${base.y}px`;
  }
  function moveStick(x, y) {
    base = followBase(base, { x, y }, radius());
    placeStick();
    const v = stickVector(x - base.x, y - base.y, radius());
    knob.style.transform = `translate(${v.knob.x}px, ${v.knob.y}px)`;
    input.touch.stick(v.x, v.y);
    if (v.run !== running) {
      running = v.run;
      input.touch.action(ACTIONS.RUN, running);
      stick.classList.toggle('run', running);
      if (running) haptic(6);
    }
  }
  function endStick() {
    movePointer = null;
    input.touch.stick(0, 0);
    if (running) input.touch.action(ACTIONS.RUN, false);
    running = false;
    stick.classList.remove('on', 'run');
    el.classList.remove('moving');
    knob.style.transform = '';
  }
  const moveZone = $('.ptouch-move');
  moveZone.addEventListener('pointerdown', (e) => {
    if (movePointer !== null) return;
    e.preventDefault();
    movePointer = e.pointerId;
    moveZone.setPointerCapture?.(e.pointerId);
    base = clampBase(e.clientX, e.clientY, radius(), { width: innerWidth, height: innerHeight }, insets());
    placeStick();
    stick.classList.add('on');
    el.classList.add('moving');
    moveStick(e.clientX, e.clientY);
  });
  moveZone.addEventListener('pointermove', (e) => { if (e.pointerId === movePointer) moveStick(e.clientX, e.clientY); });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    moveZone.addEventListener(type, (e) => { if (e.pointerId === movePointer) endStick(); });
  }

  // ---- look ---------------------------------------------------------------------------------
  const lookZone = $('.ptouch-look');
  const lookers = new Map(); // pointerId -> last {x, y}
  lookZone.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    lookZone.setPointerCapture?.(e.pointerId);
    lookers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  });
  lookZone.addEventListener('pointermove', (e) => {
    const last = lookers.get(e.pointerId);
    if (!last) return;
    // Coalesced events keep fast swipes smooth where the browser batches them.
    const events = e.getCoalescedEvents?.() ?? [e];
    let x = last.x;
    let y = last.y;
    for (const c of events) {
      input.touch.look(c.clientX - x, c.clientY - y);
      x = c.clientX;
      y = c.clientY;
    }
    lookers.set(e.pointerId, { x, y });
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) lookZone.addEventListener(type, (e) => lookers.delete(e.pointerId));

  // ---- buttons ------------------------------------------------------------------------------
  const pressedBy = new Map(); // pointerId -> button
  el.querySelectorAll('.ptouch-btn').forEach((b) => {
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      b.setPointerCapture?.(e.pointerId);
      pressedBy.set(e.pointerId, b);
      b.classList.add('down');
      haptic();
      if (b.dataset.next) onNext();
      else input.touch.action(b.dataset.action, true);
    });
    const up = (e) => {
      if (pressedBy.get(e.pointerId) !== b) return;
      pressedBy.delete(e.pointerId);
      b.classList.remove('down');
      if (b.dataset.action) input.touch.action(b.dataset.action, false);
    };
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(type, up);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  function releaseAll() {
    if (movePointer !== null) endStick();
    lookers.clear();
    for (const [, b] of pressedBy) { b.classList.remove('down'); if (b.dataset.action) input.touch.action(b.dataset.action, false); }
    pressedBy.clear();
  }

  let visible = false;
  let lastSay = '';
  return {
    el,
    get visible() { return visible; },
    setVisible(v) {
      if (v === visible) return;
      visible = v;
      el.hidden = !v;
      if (!v) releaseAll();
    },
    /** What the buttons offer now: interact label (or null), throw / decorate available, decorate mode. */
    setState({ interact = null, canThrow = false, canDecorate = false, decorating = false } = {}) {
      el.style.setProperty('--s', String(scale()));
      btn.interact.classList.toggle('off', !interact && !decorating);
      btn.interact.firstChild.textContent = decorating ? '✓' : TOUCH_GLYPHS.interact;
      btn.interact.querySelector('small').textContent = decorating ? 'place' : 'use';
      btn.throw.hidden = !canThrow || decorating;
      btn.decorate.hidden = !canDecorate && !decorating;
      btn.decorate.querySelector('small').textContent = decorating ? 'done' : 'nest';
      btn.rotate.hidden = !decorating;
      btn.next.hidden = !decorating;
      btn.pickup.hidden = !decorating;
      const text = decorating ? '' : interact ?? '';
      if (text !== lastSay) {
        lastSay = text;
        say.textContent = text;
        say.classList.toggle('on', !!text);
      }
    },
    releaseAll,
    dispose() { releaseAll(); el.remove(); style.remove(); },
  };
}
