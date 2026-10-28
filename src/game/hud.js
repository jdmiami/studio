// The in-game HUD (DOM, event-driven where it can be): the quest tracker (top right, from the quest
// engine's tracked()), the area chip (the Nest, or the trip's name and its shareable seed code),
// the finds counter, a soft crosshair dot, the interaction prompt (bottom centre, with the input
// layer's label for the current device), a loading veil, and the performance overlay (FPS, frame
// time, draw calls against their budgets) when settings.showFps is on.
const CSS = `
.ghud { position: fixed; inset: 0; pointer-events: none; font-family: Nunito, 'Trebuchet MS', system-ui, sans-serif;
  color: #fff8ef; text-shadow: 0 1px 2px rgba(40, 25, 20, 0.55); user-select: none; z-index: 5; }
.ghud-panel { position: absolute; background: rgba(48, 36, 32, 0.42); border-radius: 14px; backdrop-filter: blur(2px);
  box-shadow: inset 0 0 0 2px rgba(255, 240, 225, 0.12); }
.ghud-panel::after { content: ''; position: absolute; inset: 4px; border: 1.5px dashed rgba(255, 240, 225, 0.28); border-radius: 11px; }
.ghud-quest { top: max(14px, env(safe-area-inset-top)); right: max(14px, env(safe-area-inset-right)); padding: 10px 16px; max-width: min(360px, 42vw); text-align: right;
  transition: transform 0.35s ease, opacity 0.35s; }
.ghud-quest.flash { transform: scale(1.05); }
.ghud-quest-title { font-size: 12px; font-weight: 800; letter-spacing: 1.6px; color: #ffd27a; text-transform: uppercase; }
.ghud-quest-step { font-size: 15px; font-weight: 800; margin-top: 3px; line-height: 1.3; }
.ghud-quest-pips { margin-top: 6px; display: flex; gap: 4px; justify-content: flex-end; }
.ghud-pip { width: 8px; height: 8px; border-radius: 50%; background: rgba(255, 255, 255, 0.25); }
.ghud-pip.on { background: #a8e6d8; }
.ghud-area { top: max(14px, env(safe-area-inset-top)); left: max(14px, env(safe-area-inset-left)); padding: 8px 14px; display: flex; gap: 12px; align-items: center; }
.ghud-area-name { font-size: 15px; font-weight: 800; letter-spacing: 0.5px; }
.ghud-area-code { font-size: 12px; font-weight: 800; letter-spacing: 2px; padding: 2px 8px; border-radius: 8px; background: rgba(255, 255, 255, 0.16); }
.ghud-finds { font-size: 13px; font-weight: 800; color: #f6dba6; }
.ghud-dot { position: absolute; left: 50%; top: 50%; width: 6px; height: 6px; margin: -3px 0 0 -3px; border-radius: 50%;
  background: rgba(255, 248, 239, 0.75); box-shadow: 0 0 0 1.5px rgba(48, 36, 32, 0.35); transition: transform 0.15s; }
.ghud-dot.near { transform: scale(1.8); background: #ffd27a; }
.ghud-prompt { position: absolute; left: 50%; bottom: max(64px, calc(env(safe-area-inset-bottom) + 48px)); transform: translateX(-50%);
  display: flex; gap: 10px; opacity: 0; transition: opacity 0.2s; }
.ghud-prompt.on { opacity: 1; }
.ghud-chip { font-size: 16px; font-weight: 800; padding: 6px 16px; border-radius: 11px; background: rgba(48, 36, 32, 0.6); white-space: nowrap; }
.ghud-key { display: inline-block; min-width: 18px; padding: 0 6px; margin-right: 8px; border-radius: 6px; background: #fff3e4; color: #5a4038;
  text-shadow: none; text-align: center; }
.ghud-perf { position: absolute; left: max(14px, env(safe-area-inset-left)); bottom: max(14px, env(safe-area-inset-bottom)); padding: 6px 10px;
  font: 700 11px/1.45 ui-monospace, Menlo, monospace; display: none; white-space: pre; }
.ghud-perf.on { display: block; }
.ghud-perf .over { color: #ff9c8a; }
.ghud-veil { position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px;
  background: radial-gradient(circle at 50% 45%, #f6e3d8, #e6c6b8); color: #6b4c42; text-shadow: none; transition: opacity 0.6s; z-index: 20; }
.ghud-veil.off { opacity: 0; }
.ghud-veil-title { font-size: 44px; font-weight: 900; letter-spacing: 2px; color: #f3b3bd; -webkit-text-stroke: 2px #fff6ee; }
.ghud-veil-bar { width: 220px; height: 10px; border-radius: 6px; background: rgba(107, 76, 66, 0.15); overflow: hidden; }
.ghud-veil-bar > div { height: 100%; width: 0; background: linear-gradient(90deg, #f3b3bd, #a8d5b9); border-radius: 6px; transition: width 0.25s; }
.ghud-veil-text { font-size: 14px; font-weight: 800; letter-spacing: 1px; }
.ghud.hidden .ghud-quest, .ghud.hidden .ghud-area, .ghud.hidden .ghud-dot, .ghud.hidden .ghud-prompt { visibility: hidden; }
`;

export function createGameHud() {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const el = document.createElement('div');
  el.className = 'ghud hidden';
  el.innerHTML = `
    <div class="ghud-panel ghud-area"><span class="ghud-area-name">The Nest</span><span class="ghud-area-code" hidden></span><span class="ghud-finds"></span></div>
    <div class="ghud-panel ghud-quest" hidden><div class="ghud-quest-title"></div><div class="ghud-quest-step"></div><div class="ghud-quest-pips"></div></div>
    <div class="ghud-dot"></div>
    <div class="ghud-prompt"></div>
    <div class="ghud-panel ghud-perf"></div>
    <div class="ghud-veil"><div class="ghud-veil-title">Phluph</div><div class="ghud-veil-bar"><div></div></div><div class="ghud-veil-text">Fluffing the felt…</div></div>`;
  document.body.appendChild(el);
  const $ = (s) => el.querySelector(s);
  const quest = $('.ghud-quest');
  const dot = $('.ghud-dot');
  const prompt = $('.ghud-prompt');
  const perf = $('.ghud-perf');
  const veil = $('.ghud-veil');
  let lastQuest = '';
  let lastPrompt = '';

  return {
    el,
    setVisible(v) { el.classList.toggle('hidden', !v); },
    loading(progress, text) {
      veil.classList.remove('off');
      veil.style.display = '';
      $('.ghud-veil-bar > div').style.width = `${Math.round(progress * 100)}%`;
      if (text) $('.ghud-veil-text').textContent = text;
    },
    loaded() {
      veil.classList.add('off');
      setTimeout(() => { veil.style.display = 'none'; }, 650);
    },
    setArea({ name, code = null }) {
      $('.ghud-area-name').textContent = name;
      const c = $('.ghud-area-code');
      c.hidden = !code;
      c.textContent = code ? `SEED ${code}` : '';
    },
    setFinds(found, total) { $('.ghud-finds').textContent = `✿ ${found}/${total}`; },
    /** tracked: { title, step, index, total } | null */
    setQuest(tracked) {
      const key = tracked ? `${tracked.title}|${tracked.step}|${tracked.index}` : '';
      if (key === lastQuest) return;
      lastQuest = key;
      quest.hidden = !tracked;
      if (!tracked) return;
      $('.ghud-quest-title').textContent = tracked.title;
      $('.ghud-quest-step').textContent = tracked.step;
      $('.ghud-quest-pips').innerHTML = Array.from({ length: tracked.total }, (_, i) => `<span class="ghud-pip${i < tracked.index ? ' on' : ''}"></span>`).join('');
      quest.classList.add('flash');
      setTimeout(() => quest.classList.remove('flash'), 350);
    },
    /** prompts: [{ key, text }] (empty hides). */
    setPrompt(prompts) {
      const key = prompts.map((p) => p.key + p.text).join('|');
      if (key === lastPrompt) return;
      lastPrompt = key;
      prompt.classList.toggle('on', prompts.length > 0);
      dot.classList.toggle('near', prompts.length > 0);
      if (prompts.length) prompt.innerHTML = prompts.map((p) => `<span class="ghud-chip"><span class="ghud-key">${p.key}</span>${p.text}</span>`).join('');
    },
    /** stats: { fps, ms, p95, calls, tris, chunks } with budgets { ms, calls }. */
    setPerf(on, stats, budgets) {
      perf.classList.toggle('on', on);
      if (!on || !stats) return;
      const over = (v, b) => (v > b ? ` class="over"` : '');
      perf.innerHTML = `<span${over(stats.p95, budgets.ms)}>${stats.fps.toFixed(0)} fps  ${stats.ms.toFixed(1)} ms  p95 ${stats.p95.toFixed(1)}</span>\n`
        + `<span${over(stats.calls, budgets.calls)}>draws ${stats.calls}</span>  tris ${(stats.tris / 1000).toFixed(0)}k  chunks ${stats.chunks}`;
    },
  };
}
