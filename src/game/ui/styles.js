// The felt stylesheet for every UI screen. Everything is sized in em off one root unit (--u) that
// scales with the viewport (proportional from 1024x572 up to 4K, floored for readability) times the
// player's menu text size; safe-area insets pad the screen edges.

// A faint felt-fibre noise, tiled over panels.
const FELT = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="3" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 .95  0 0 0 0 .9  0 0 0 .55 0"/></filter><rect width="160" height="160" filter="url(#n)" opacity=".5"/></svg>',
)}")`;

export const CSS = `
.phl-ui {
  --scale: 1;
  --u: calc(clamp(14px, min(2.55vh, 1.5vw), 80px) * var(--scale));
  --cream: #fff8ef; --cream-2: rgba(255, 248, 239, 0.74); --cream-3: rgba(255, 248, 239, 0.5);
  --cocoa: #4a312b; --cocoa-2: #6b4a41;
  --panel-a: rgba(94, 66, 58, 0.80); --panel-b: rgba(66, 45, 40, 0.84);
  --stitch: rgba(255, 238, 222, 0.46);
  --pink: #f3c3be; --rose: #e9a5a0; --sage: #aac99c; --sage-d: #7fa37a; --sky: #a9c6ea; --butter: #f4d68e;
  --lilac: #c2b3dc; --peach: #f0c3a8; --mint: #a7d0c0;
  --paper: #f8eee2; --paper-2: #efdfcc; --ink: #5a3d35; --ink-2: #8a6a5e;
  --ring: #fff0b8; --ring-glow: rgba(255, 222, 140, 0.38);
  --safe-t: max(2.4vh, env(safe-area-inset-top)); --safe-b: max(2.4vh, env(safe-area-inset-bottom));
  --safe-l: max(2.4vw, env(safe-area-inset-left)); --safe-r: max(2.4vw, env(safe-area-inset-right));
  position: fixed; inset: 0; z-index: 50; pointer-events: none; font-size: var(--u); line-height: 1.35;
  font-family: Nunito, 'Varela Round', 'Arial Rounded MT Bold', 'Trebuchet MS', system-ui, sans-serif;
  color: var(--cream); text-shadow: 0 0.06em 0.14em rgba(40, 25, 20, 0.5); user-select: none;
  -webkit-font-smoothing: antialiased;
}
:where(.phl-ui) *, :where(.phl-ui) *::before, :where(.phl-ui) *::after { box-sizing: border-box; }
/* Zero-specificity resets so component classes always win. */
:where(.phl-ui) button { font: inherit; color: inherit; text-shadow: inherit; }
:where(.phl-ui) :is(h1, h2, h3, p) { margin: 0; }

/* ---------- layers ---------- */
.phl-layer-screens, .phl-layer-dialogue, .phl-layer-decorate, .phl-layer-toasts { position: absolute; inset: 0; pointer-events: none; }
.phl-layer-decorate { z-index: 1; } .phl-layer-dialogue { z-index: 2; } .phl-layer-screens { z-index: 3; } .phl-layer-toasts { z-index: 4; }

.phl-screen {
  position: absolute; inset: 0; pointer-events: auto; display: flex; align-items: center; justify-content: center;
  padding: var(--safe-t) var(--safe-r) var(--safe-b) var(--safe-l);
  animation: phl-in 0.26s cubic-bezier(.2, .8, .3, 1) both;
}
.phl-screen.is-scrim { background: radial-gradient(ellipse at 50% 45%, rgba(60, 38, 33, 0.28), rgba(42, 26, 22, 0.62)); }
.phl-screen.is-hidden { display: none; }
.phl-screen.is-under { filter: saturate(0.85) brightness(0.8); }
.phl-screen.is-leaving { animation: phl-out 0.18s ease-in both; pointer-events: none; }
@keyframes phl-in { from { opacity: 0; transform: translateY(0.7em) scale(0.985); } to { opacity: 1; transform: none; } }
@keyframes phl-out { to { opacity: 0; transform: translateY(0.5em) scale(0.985); } }

/* ---------- felt panels ---------- */
.phl-panel {
  position: relative; border-radius: 1.5em; padding: 1.3em 1.6em;
  background: ${FELT}, linear-gradient(180deg, var(--panel-a), var(--panel-b));
  box-shadow: 0 0.9em 2.6em rgba(38, 20, 16, 0.38), 0 0.15em 0.4em rgba(38, 20, 16, 0.25),
    inset 0 0 0 0.11em rgba(255, 236, 220, 0.16), inset 0 0.35em 0.9em rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(8px) saturate(1.1); -webkit-backdrop-filter: blur(8px) saturate(1.1);
  max-height: 100%; display: flex; flex-direction: column; min-height: 0;
}
.phl-panel::before {
  content: ''; position: absolute; inset: 0.48em; border: 0.11em dashed var(--stitch); border-radius: 1.12em; pointer-events: none;
}
.phl-page {
  position: relative; border-radius: 1.3em; color: var(--ink); text-shadow: none;
  background: ${FELT}, linear-gradient(180deg, var(--paper), var(--paper-2));
  box-shadow: inset 0 0 0 0.11em rgba(160, 110, 95, 0.18), 0 0.3em 0.8em rgba(40, 22, 18, 0.22);
}
.phl-page::before { content: ''; position: absolute; inset: 0.42em; border: 0.1em dashed rgba(201, 132, 122, 0.55); border-radius: 0.95em; pointer-events: none; }

.phl-header { display: flex; align-items: center; justify-content: space-between; gap: 1em; margin-bottom: 0.7em; flex: none; }
.phl-title { font-size: 1.65em; font-weight: 900; letter-spacing: 0.02em; line-height: 1.1; }
.phl-sub { color: var(--cream-2); font-weight: 700; font-size: 0.9em; margin-top: 0.15em; }
.phl-back {
  display: inline-flex; align-items: center; gap: 0.45em; border: 0; cursor: pointer; font-weight: 800; font-size: 0.85em;
  background: rgba(255, 244, 232, 0.1); padding: 0.4em 0.85em 0.4em 0.45em; border-radius: 999px;
}
/* Touch screens (the game sets body.touch-ui): no keyboard hints; things are tapped. */
body.touch-ui .phl-keycap, body.touch-ui .phl-title-hint { display: none !important; }
/* The decorate bar moves to the top, clear of the thumbs' controls. */
body.touch-ui .phl-decorate { bottom: auto !important; top: calc(max(0.9em, env(safe-area-inset-top)) + 7.5em); }
.phl-keycap {
  display: inline-flex; align-items: center; justify-content: center; min-width: 1.9em; height: 1.55em; padding: 0 0.4em;
  font-size: 0.75em; font-weight: 900; letter-spacing: 0.03em; color: var(--cocoa); text-shadow: none;
  background: linear-gradient(180deg, #fffaf2, #ecdccb); border-radius: 0.45em; box-shadow: 0 0.12em 0 rgba(60, 35, 28, 0.35);
}

/* ---------- buttons ---------- */
.phl-btn {
  position: relative; display: inline-flex; align-items: center; justify-content: center; gap: 0.5em;
  border: 0; border-radius: 999px; padding: 0.6em 1.5em; min-height: 2.5em; cursor: pointer;
  font-weight: 800; font-size: 1.04em; letter-spacing: 0.02em; color: var(--cream);
  background: rgba(255, 244, 232, 0.11);
  transition: transform 0.16s cubic-bezier(.3, 1.4, .5, 1), background 0.16s, color 0.16s, box-shadow 0.16s;
}
.phl-btn::after { content: ''; position: absolute; inset: 0.24em; border: 0.09em dashed rgba(255, 240, 226, 0.32); border-radius: inherit; pointer-events: none; }
.phl-btn.is-primary { background: rgba(243, 195, 190, 0.3); }
.phl-btn.is-danger { background: rgba(233, 140, 130, 0.24); }
.phl-btn.is-quiet { background: transparent; }
.phl-btn[disabled] { opacity: 0.38; cursor: default; }
.phl-btn-icon svg { width: 1.3em; height: 1.3em; display: block; }
.phl-btn-sub { font-size: 0.72em; font-weight: 700; opacity: 0.75; }

/* The focus ring: one look for every focusable (keyboard, pad and mouse hover share it). */
.phl-ui [data-focus] { outline: none; }
.phl-ui .phl-focus {
  box-shadow: 0 0 0 0.15em var(--ring), 0 0 0 0.42em var(--ring-glow), 0 0.35em 0.9em rgba(40, 20, 16, 0.3);
}
.phl-btn.phl-focus { background: var(--pink); color: var(--cocoa); text-shadow: none; transform: scale(1.045); }
.phl-btn.phl-focus::after { border-color: rgba(120, 66, 56, 0.42); }
.phl-btn.is-danger.phl-focus { background: #f0a39a; }
.phl-back.phl-focus { background: var(--pink); color: var(--cocoa); text-shadow: none; }
.phl-page .phl-focus { box-shadow: 0 0 0 0.15em #c9746b, 0 0 0 0.42em rgba(233, 165, 160, 0.42); }

/* ---------- tabs ---------- */
.phl-tabs { display: flex; align-items: center; gap: 0.4em; margin-bottom: 0.8em; flex: none; }
.phl-tab {
  border: 0; cursor: pointer; font-weight: 800; padding: 0.42em 1.1em; border-radius: 0.8em 0.8em 0.4em 0.4em;
  background: rgba(255, 244, 232, 0.09); color: var(--cream-2); transition: background 0.15s, color 0.15s;
}
.phl-tab.is-active { background: var(--cream); color: var(--cocoa); text-shadow: none; }
.phl-tab-hint { opacity: 0.85; }

/* ---------- settings rows ---------- */
.phl-row { display: flex; align-items: center; justify-content: space-between; gap: 1.2em; padding: 0.32em 0.2em; min-height: 2.4em; }
.phl-row + .phl-row { border-top: 0.07em dashed rgba(255, 238, 222, 0.16); }
.phl-row-label { font-weight: 800; display: flex; flex-direction: column; }
.phl-row-label small { font-weight: 700; color: var(--cream-3); font-size: 0.75em; }
.phl-slider { display: flex; align-items: center; gap: 0.5em; padding: 0.3em 0.6em; border-radius: 999px; width: 17em; flex: none; cursor: pointer; }
.phl-slider-track { position: relative; flex: 1; height: 0.62em; border-radius: 999px; background: rgba(30, 18, 15, 0.35);
  box-shadow: inset 0 0.08em 0.15em rgba(0, 0, 0, 0.25); }
.phl-slider-fill { position: absolute; inset: 0 auto 0 0; border-radius: inherit; background: linear-gradient(90deg, var(--sage), #c9e2b8); }
.phl-slider-fill::after { content: ''; position: absolute; inset: 0.2em 0.3em; border-top: 0.08em dashed rgba(70, 100, 60, 0.45); }
.phl-slider-knob { position: absolute; top: 50%; width: 1.25em; height: 1.25em; margin: -0.625em 0 0 -0.625em; border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #fffdf8, #f0dcc8); box-shadow: 0 0.12em 0.25em rgba(40, 20, 16, 0.4); transition: left 0.08s; }
.phl-slider-value { width: 3.6em; text-align: right; font-weight: 900; font-variant-numeric: tabular-nums; }
.phl-slider-arrow { opacity: 0; font-weight: 900; font-size: 1.1em; width: 0.6em; text-align: center; transition: opacity 0.15s; }
.phl-slider.phl-focus .phl-slider-arrow { opacity: 0.9; }
.phl-toggle, .phl-stepper {
  display: inline-flex; align-items: center; gap: 0.6em; border: 0; cursor: pointer; padding: 0.35em 0.8em; border-radius: 999px;
  background: rgba(255, 244, 232, 0.08); font-weight: 800; min-width: 8em; justify-content: flex-end;
}
.phl-toggle-track { width: 2.6em; height: 1.4em; border-radius: 999px; background: rgba(30, 18, 15, 0.35); position: relative; transition: background 0.2s; }
.phl-toggle-knob { position: absolute; top: 0.17em; left: 0.17em; width: 1.06em; height: 1.06em; border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #fffdf8, #e8d4c0); transition: transform 0.2s cubic-bezier(.3, 1.4, .5, 1); }
.phl-toggle.is-on .phl-toggle-track { background: var(--sage-d); }
.phl-toggle.is-on .phl-toggle-knob { transform: translateX(1.2em); }
.phl-toggle-text { width: 2em; text-align: left; }
.phl-stepper { position: relative; padding-bottom: 0.55em; }
.phl-stepper-text { min-width: 5em; text-align: center; }
.phl-stepper-arrow { font-size: 1.15em; font-weight: 900; opacity: 0.6; }
.phl-stepper-dots { position: absolute; left: 50%; bottom: 0.2em; transform: translateX(-50%); display: flex; gap: 0.25em; }
.phl-stepper-dots i { width: 0.32em; height: 0.32em; border-radius: 50%; background: var(--cream-3); }
.phl-stepper-dots i.on { background: var(--butter); }

.phl-scroll { overflow-y: auto; overflow-x: hidden; min-height: 0; scrollbar-width: thin; scrollbar-color: rgba(255, 238, 222, 0.35) transparent;
  padding: 0.4em 0.6em; margin: 0 -0.6em; overscroll-behavior: contain; }
.phl-page .phl-scroll { scrollbar-color: rgba(160, 110, 95, 0.35) transparent; }

/* ---------- title ---------- */
.phl-title-screen { background: radial-gradient(ellipse at 50% 40%, rgba(255, 236, 225, 0.12), rgba(60, 36, 30, 0.38)); overflow: hidden; }
.phl-motes { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.phl-mote { position: absolute; border-radius: 50%; opacity: 0;
  background: radial-gradient(circle at 40% 40%, rgba(255, 252, 246, 0.95), rgba(255, 240, 228, 0.35) 55%, transparent 72%);
  animation: phl-drift var(--d, 18s) linear var(--delay, 0s) infinite; filter: blur(0.02em); }
.phl-mote.is-fluff { border-radius: 40% 60% 55% 45%; background: radial-gradient(circle, rgba(255, 228, 226, 0.85), rgba(255, 220, 215, 0.25) 60%, transparent 75%); }
@keyframes phl-drift {
  0% { transform: translate(0, 0) rotate(0deg); opacity: 0; }
  12% { opacity: var(--o, 0.7); }
  50% { transform: translate(var(--dx, 4vw), -22vh) rotate(160deg); }
  88% { opacity: var(--o, 0.7); }
  100% { transform: translate(calc(var(--dx, 4vw) * -0.6), -46vh) rotate(320deg); opacity: 0; }
}
.phl-title-wrap { position: relative; display: flex; flex-direction: column; align-items: center; gap: 0.6em; }
.phl-logo { display: flex; align-items: flex-end; gap: 0.05em; font-size: 4.6em; font-weight: 900; line-height: 1; filter: drop-shadow(0 0.08em 0.1em rgba(50, 28, 22, 0.35)); }
.phl-logo-l {
  position: relative; display: inline-flex; align-items: center; justify-content: center; min-width: 0.86em; padding: 0.06em 0.12em 0.12em;
  border-radius: 0.38em; color: #fffaf3; text-shadow: 0 0.04em 0 rgba(90, 50, 40, 0.35);
  background: radial-gradient(circle at 30% 25%, rgba(255, 255, 255, 0.35), transparent 55%), var(--c);
  box-shadow: inset 0 -0.06em 0 rgba(90, 50, 40, 0.18), 0 0.03em 0 rgba(90, 50, 40, 0.2);
  transform: rotate(var(--r, 0deg)) translateY(var(--y, 0)); animation: phl-bob 4.2s ease-in-out var(--bd, 0s) infinite;
}
.phl-logo-l::after { content: ''; position: absolute; inset: 0.07em; border: 0.025em dashed rgba(255, 252, 246, 0.85); border-radius: 0.3em; }
@keyframes phl-bob { 50% { transform: rotate(calc(var(--r, 0deg) * -0.6)) translateY(calc(var(--y, 0em) - 0.05em)); } }
.phl-tagline { font-size: 1.1em; font-weight: 800; color: var(--cream); letter-spacing: 0.06em; margin-top: 0.1em; }
.phl-title-menu { display: flex; flex-direction: column; align-items: stretch; gap: 0.45em; width: 15em; padding: 1.1em 1.3em; margin-top: 0.4em; }
.phl-title-menu .phl-btn { width: 100%; }
.phl-title-foot { position: absolute; right: var(--safe-r); bottom: var(--safe-b); font-size: 0.75em; font-weight: 800; color: var(--cream-2); }
.phl-title-hint { position: absolute; left: var(--safe-l); bottom: var(--safe-b); font-size: 0.75em; font-weight: 800; color: var(--cream-2); display: flex; gap: 0.9em; align-items: center; }
.phl-title-hint span { display: inline-flex; gap: 0.35em; align-items: center; }

/* ---------- menus (pause) ---------- */
.phl-pause { display: flex; gap: 1.2em; align-items: stretch; max-width: 100%; }
.phl-pause-menu { width: 15em; gap: 0.45em; }
.phl-pause-menu .phl-btn { width: 100%; }
.phl-pause-card { width: 15em; justify-content: flex-start; gap: 0.5em; }
.phl-stat { display: flex; justify-content: space-between; gap: 1em; font-weight: 800; text-align: right; }
.phl-stat span:first-child { color: var(--cream-2); font-weight: 700; }
.phl-mini-bar { height: 0.7em; border-radius: 999px; background: rgba(30, 18, 15, 0.35); overflow: hidden; margin: 0.15em 0 0.3em; }
.phl-mini-bar > div { height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--rose), var(--butter)); }

/* ---------- slots ---------- */
.phl-slots { width: min(60em, 100%); }
.phl-slot-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.8em; padding: 0.5em 0.3em; }
.phl-slot {
  position: relative; text-align: left; border: 0; cursor: pointer; border-radius: 1.1em; padding: 0.9em 0.95em 0.85em; min-height: 12.5em;
  display: flex; flex-direction: column; gap: 0.18em; color: var(--ink); text-shadow: none;
  background: ${FELT}, linear-gradient(180deg, var(--paper), var(--paper-2));
  box-shadow: 0 0.25em 0.6em rgba(40, 22, 18, 0.25); transition: transform 0.16s cubic-bezier(.3, 1.4, .5, 1);
}
.phl-slot::before { content: ''; position: absolute; inset: 0.36em; border: 0.09em dashed rgba(201, 132, 122, 0.5); border-radius: 0.8em; pointer-events: none; }
.phl-slot.is-auto { background: ${FELT}, linear-gradient(180deg, #eef3e6, #dfe8d3); }
.phl-slot.is-empty { background: rgba(255, 244, 232, 0.12); color: var(--cream); text-shadow: inherit; align-items: center; justify-content: center; text-align: center; }
.phl-slot.is-empty::before { border-color: rgba(255, 238, 222, 0.4); }
.phl-slot.is-selected:not(.phl-focus) { box-shadow: 0 0 0 0.13em rgba(255, 240, 184, 0.7), 0 0.25em 0.6em rgba(40, 22, 18, 0.25); }
.phl-slot.phl-focus { transform: translateY(-0.2em) scale(1.02); box-shadow: 0 0 0 0.15em var(--ring), 0 0 0 0.42em var(--ring-glow), 0 0.6em 1.2em rgba(40, 20, 16, 0.35); }
.phl-slot-tag { align-self: flex-start; font-size: 0.68em; font-weight: 900; letter-spacing: 0.1em; text-transform: uppercase; padding: 0.15em 0.6em; border-radius: 999px; background: var(--pink); color: var(--cocoa); }
.phl-slot.is-auto .phl-slot-tag { background: var(--sage); }
.phl-slot-name { font-size: 1.12em; font-weight: 900; margin: 0.2em 0 0.15em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.phl-slot-meta { display: flex; justify-content: space-between; font-size: 0.8em; font-weight: 700; gap: 0.5em; }
.phl-slot-meta span:first-child { color: var(--ink-2); }
.phl-slot-saved { margin-top: auto; padding-top: 0.35em; font-size: 0.74em; font-weight: 800; color: var(--ink-2); }
.phl-slot-plus { font-size: 2.2em; font-weight: 900; line-height: 1; opacity: 0.85; }
.phl-slot-empty-text { font-weight: 800; font-size: 0.9em; color: var(--cream-2); }
.phl-slot-actions { display: flex; flex-wrap: wrap; gap: 0.5em; justify-content: center; margin-top: 0.7em; flex: none; }
.phl-slot-actions .phl-btn { font-size: 0.9em; padding: 0.5em 1.2em; min-height: 2.3em; }

/* ---------- modal ---------- */
.phl-modal { width: min(30em, 100%); gap: 0.7em; --panel-a: rgba(98, 69, 61, 0.97); --panel-b: rgba(70, 48, 43, 0.98); }
.phl-modal-text { color: var(--cream-2); font-weight: 700; }
.phl-modal-buttons { display: flex; justify-content: flex-end; gap: 0.6em; margin-top: 0.3em; flex-wrap: wrap; }
.phl-input {
  font: inherit; font-weight: 800; width: 100%; color: var(--ink); text-shadow: none; padding: 0.55em 0.8em; border-radius: 0.8em;
  border: 0.1em dashed rgba(201, 132, 122, 0.6); background: var(--paper); outline: none; user-select: text; resize: none;
}
textarea.phl-input { font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; font-size: 0.75em; font-weight: 600; height: 7.5em; word-break: break-all; }
.phl-input.phl-focus { border-style: solid; border-color: #c9746b; }

/* ---------- settings ---------- */
.phl-settings { width: min(46em, 100%); height: 100%; max-height: 34em; }
.phl-settings-body { flex: 1; mask-image: linear-gradient(180deg, #000 calc(100% - 1.6em), transparent); -webkit-mask-image: linear-gradient(180deg, #000 calc(100% - 1.6em), transparent); padding-bottom: 1.4em; }
.phl-section-title { font-size: 0.78em; font-weight: 900; letter-spacing: 0.14em; text-transform: uppercase; color: var(--butter); margin: 0.7em 0 0.15em; }
.phl-section-title:first-child { margin-top: 0; }
.phl-bind-row { display: grid; grid-template-columns: 1fr 7.5em 7.5em; gap: 0.5em; align-items: center; padding: 0.18em 0.2em; }
.phl-bind-row + .phl-bind-row { border-top: 0.07em dashed rgba(255, 238, 222, 0.14); }
.phl-bind-name { font-weight: 800; }
.phl-bind {
  border: 0; cursor: pointer; font-weight: 900; font-size: 0.85em; padding: 0.4em 0.6em; border-radius: 0.6em; min-height: 2.1em;
  color: var(--cocoa); text-shadow: none; background: linear-gradient(180deg, #fffaf2, #ecdccb); box-shadow: 0 0.13em 0 rgba(60, 35, 28, 0.35);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.phl-bind.is-empty { background: rgba(255, 244, 232, 0.1); color: var(--cream-3); box-shadow: none; }
.phl-bind.is-capturing { background: var(--butter); animation: phl-pulse 0.9s ease-in-out infinite; }
@keyframes phl-pulse { 50% { filter: brightness(1.08); transform: scale(1.04); } }
.phl-settings-foot { display: flex; justify-content: space-between; align-items: center; gap: 1em; margin-top: 0.6em; flex: none; font-size: 0.8em; color: var(--cream-2); font-weight: 700; }

/* ---------- book (journal + collection) ---------- */
.phl-book { width: min(62em, 100%); height: 100%; max-height: 36em; }
.phl-book-body { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 0.9em; perspective: 120em; }
.phl-book-left, .phl-book-right { min-height: 0; display: flex; flex-direction: column; padding: 1em 1.1em; }
.phl-book-left { border-radius: 1.3em 0.5em 0.5em 1.3em; }
.phl-book-right { border-radius: 0.5em 1.3em 1.3em 0.5em; }
.phl-book-body.is-turning .phl-book-left { animation: phl-turn-l 0.42s cubic-bezier(.3, .7, .3, 1); transform-origin: right center; }
.phl-book-body.is-turning .phl-book-right { animation: phl-turn-r 0.42s cubic-bezier(.3, .7, .3, 1); transform-origin: left center; }
.phl-book-body.is-turning-back .phl-book-left { animation-name: phl-turn-r; transform-origin: right center; }
.phl-book-body.is-turning-back .phl-book-right { animation-name: phl-turn-l; transform-origin: left center; }
@keyframes phl-turn-l { 0% { transform: rotateY(0); } 45% { transform: rotateY(14deg); filter: brightness(0.92); } 100% { transform: rotateY(0); } }
@keyframes phl-turn-r { 0% { transform: rotateY(0); } 45% { transform: rotateY(-14deg); filter: brightness(0.92); } 100% { transform: rotateY(0); } }
.phl-page-title { font-size: 0.78em; font-weight: 900; letter-spacing: 0.14em; text-transform: uppercase; color: #c9746b; margin-bottom: 0.4em; flex: none; }
.phl-empty { color: var(--ink-2); font-weight: 700; font-style: italic; padding: 1em 0.3em; }

.phl-progress { display: flex; align-items: center; gap: 0.7em; font-weight: 900; flex: none; }
.phl-felt-bar { position: relative; width: 12em; height: 1em; border-radius: 999px; background: rgba(30, 18, 15, 0.35); overflow: hidden;
  box-shadow: inset 0 0.08em 0.15em rgba(0, 0, 0, 0.28); }
.phl-felt-bar > div { height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--rose), var(--butter)); position: relative; transition: width 0.5s; }
.phl-felt-bar > div::after { content: ''; position: absolute; left: 0.3em; right: 0.3em; top: 50%; border-top: 0.08em dashed rgba(120, 60, 50, 0.5); }

.phl-quest-item {
  display: flex; align-items: center; gap: 0.6em; text-align: left; width: 100%; border: 0; cursor: pointer; font-weight: 800; color: var(--ink);
  text-shadow: none; background: transparent; padding: 0.5em 0.7em; border-radius: 0.8em; margin-bottom: 0.25em;
}
.phl-quest-item:hover, .phl-quest-item.is-selected { background: rgba(233, 165, 160, 0.22); }
.phl-quest-item .phl-q-prog { margin-left: auto; font-size: 0.8em; color: var(--ink-2); font-variant-numeric: tabular-nums; }
.phl-q-dot { width: 0.7em; height: 0.7em; border-radius: 50%; background: var(--rose); flex: none; }
.phl-q-dot.is-done { background: var(--sage-d); }
.phl-q-title { font-size: 1.25em; font-weight: 900; line-height: 1.15; }
.phl-q-giver { font-size: 0.8em; font-weight: 800; color: var(--ink-2); margin: 0.15em 0 0.5em; }
.phl-q-desc { font-weight: 600; margin-bottom: 0.7em; }
.phl-steps { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.35em; }
.phl-step { display: flex; gap: 0.55em; align-items: flex-start; font-weight: 700; }
.phl-step.is-done { color: var(--ink-2); text-decoration: line-through; text-decoration-color: rgba(138, 106, 94, 0.6); }
.phl-step.is-current { font-weight: 900; }
.phl-check { flex: none; width: 1.15em; height: 1.15em; margin-top: 0.1em; border-radius: 0.3em; border: 0.1em dashed #c9746b; display: grid; place-items: center; }
.phl-step.is-done .phl-check { background: var(--sage-d); border: 0; }
.phl-step.is-done .phl-check::after { content: ''; width: 0.32em; height: 0.6em; border: solid #fffaf3; border-width: 0 0.13em 0.13em 0; transform: rotate(45deg) translate(-0.04em, -0.06em); }
.phl-step.is-current .phl-check { border-style: solid; background: rgba(233, 165, 160, 0.25); }

.phl-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 0.55em; padding: 0.4em 0.35em; align-content: start; }
.phl-cell {
  position: relative; aspect-ratio: 1; border: 0; cursor: pointer; border-radius: 0.9em; padding: 0.25em;
  background: rgba(255, 255, 255, 0.45); box-shadow: inset 0 0 0 0.16em var(--rc, #e9dccb); display: flex; align-items: center; justify-content: center;
  transition: transform 0.15s cubic-bezier(.3, 1.4, .5, 1); color: var(--ink); text-shadow: none;
}
.phl-cell.is-unfound { background: rgba(200, 180, 160, 0.18); box-shadow: inset 0 0 0 0.12em rgba(180, 150, 130, 0.35); }
.phl-cell .phl-glyph { width: 82%; height: 82%; }
.phl-cell.is-unfound .phl-glyph { opacity: 0.55; }
.phl-cell-q { position: absolute; font-weight: 900; font-size: 0.8em; color: rgba(120, 90, 80, 0.75); bottom: 0.2em; }
.phl-cell-count { position: absolute; right: 0.25em; bottom: 0.2em; font-size: 0.66em; font-weight: 900; padding: 0.05em 0.4em; border-radius: 999px; background: var(--cocoa-2); color: var(--cream); }
.phl-cell.phl-focus { transform: scale(1.07); z-index: 1; }
.phl-cell.is-selected:not(.phl-focus) { box-shadow: inset 0 0 0 0.16em var(--rc, #e9dccb), 0 0 0 0.13em rgba(201, 116, 107, 0.6); }
.phl-detail { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 0.3em; }
.phl-detail .phl-glyph { width: 7.5em; height: 7.5em; filter: drop-shadow(0 0.15em 0.2em rgba(60, 30, 25, 0.2)); }
.phl-detail-name { font-size: 1.35em; font-weight: 900; line-height: 1.1; }
.phl-rarity { display: inline-block; font-size: 0.72em; font-weight: 900; letter-spacing: 0.1em; text-transform: uppercase; padding: 0.2em 0.75em; border-radius: 999px; color: var(--cocoa); }
.phl-detail-text { font-weight: 600; font-style: italic; max-width: 18em; }
.phl-detail-meta { display: flex; gap: 1.2em; font-size: 0.82em; font-weight: 800; color: var(--ink-2); margin-top: 0.3em; }

/* ---------- credits ---------- */
.phl-credits { width: min(32em, 100%); text-align: center; }
.phl-credits-roll { display: flex; flex-direction: column; gap: 0.9em; padding: 0.4em 0.4em 1em; }
.phl-credits-roll h3 { font-size: 0.78em; font-weight: 900; letter-spacing: 0.14em; text-transform: uppercase; color: var(--butter); }
.phl-credits-roll p { font-weight: 800; font-size: 1.05em; }
.phl-credits-roll .phl-small { font-size: 0.85em; color: var(--cream-2); font-weight: 700; }

/* ---------- dialogue ---------- */
.phl-dialogue {
  position: absolute; left: 50%; bottom: var(--safe-b); transform: translateX(-50%); width: min(44em, calc(100% - var(--safe-l) - var(--safe-r)));
  pointer-events: auto; padding: 1.5em 1.6em 1.1em; transition: opacity 0.22s, transform 0.22s; cursor: pointer;
}
.phl-dialogue.is-hidden { opacity: 0; transform: translate(-50%, 1em); pointer-events: none; }
.phl-dlg-tag {
  position: absolute; left: 1.4em; top: -0.95em; display: inline-flex; align-items: center; gap: 0.5em; padding: 0.3em 1em 0.3em 0.4em;
  border-radius: 999px; background: var(--cream); color: var(--cocoa); text-shadow: none; font-weight: 900; box-shadow: 0 0.2em 0.5em rgba(40, 20, 16, 0.3);
}
.phl-dlg-dot { width: 1.45em; height: 1.45em; border-radius: 50%; background: var(--c, var(--pink)); box-shadow: inset 0 -0.12em 0 rgba(90, 50, 40, 0.2);
  position: relative; }
.phl-dlg-dot::after { content: ''; position: absolute; inset: 0.15em; border-radius: 50%; border: 0.07em dashed rgba(255, 255, 255, 0.8); }
.phl-dlg-text { font-size: 1.12em; font-weight: 700; min-height: 3em; line-height: 1.45; }
.phl-dlg-text .rest { visibility: hidden; }
.phl-dlg-choices { display: flex; flex-direction: column; gap: 0.35em; margin-top: 0.7em; }
.phl-dlg-choice {
  text-align: left; border: 0; cursor: pointer; font-weight: 800; padding: 0.45em 0.9em; border-radius: 0.8em; display: flex; gap: 0.6em; align-items: center;
  background: rgba(255, 244, 232, 0.1); transition: background 0.15s, transform 0.15s;
}
.phl-dlg-choice::before { content: ''; width: 0.5em; height: 0.5em; border-radius: 50%; background: var(--cream-3); flex: none; }
.phl-dlg-choice.is-active { background: var(--pink); color: var(--cocoa); text-shadow: none; transform: translateX(0.3em);
  box-shadow: 0 0 0 0.15em var(--ring), 0 0 0 0.42em var(--ring-glow); }
.phl-dlg-choice.is-active::before { background: var(--rose); }
.phl-dlg-next { position: absolute; right: 1.3em; bottom: 0.7em; display: flex; align-items: center; gap: 0.4em; font-size: 0.75em; font-weight: 800; color: var(--cream-2);
  opacity: 0; transition: opacity 0.2s; }
.phl-dlg-next.is-on { opacity: 1; }
.phl-dlg-next i { width: 0.7em; height: 0.7em; border-right: 0.18em solid var(--cream); border-bottom: 0.18em solid var(--cream); transform: rotate(45deg); animation: phl-nudge 1s ease-in-out infinite; }
@keyframes phl-nudge { 50% { translate: 0 0.2em; } }

/* ---------- toasts ---------- */
.phl-toasts { position: absolute; top: calc(var(--safe-t) + 0.4em); left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 0.45em; width: min(28em, 90vw); }
.phl-toast {
  display: flex; align-items: center; gap: 0.7em; padding: 0.55em 1.1em 0.55em 0.6em; border-radius: 1em; font-weight: 800; max-width: 100%;
  background: ${FELT}, linear-gradient(180deg, var(--panel-a), var(--panel-b)); box-shadow: 0 0.4em 1.2em rgba(38, 20, 16, 0.32);
  position: relative; animation: phl-toast-in 0.32s cubic-bezier(.2, 1.3, .4, 1) both; transition: opacity 0.4s, transform 0.4s;
}
.phl-toast::before { content: ''; position: absolute; inset: 0.3em; border: 0.08em dashed var(--stitch); border-radius: 0.75em; pointer-events: none; }
.phl-toast.is-leaving { opacity: 0; transform: translateY(-0.6em) scale(0.96); }
.phl-toast-badge { flex: none; width: 2em; height: 2em; border-radius: 50%; display: grid; place-items: center; background: var(--a, var(--cream-3)); }
.phl-toast-badge svg { width: 1.7em; height: 1.7em; }
.phl-toast-badge.is-dot::after { content: ''; width: 0.6em; height: 0.6em; border-radius: 50%; background: var(--cream); }
.phl-toast-kind { display: block; font-size: 0.66em; letter-spacing: 0.14em; text-transform: uppercase; color: var(--a, var(--cream-2)); font-weight: 900; }
.phl-toast.kind-find { --a: var(--butter); } .phl-toast.kind-quest { --a: var(--sage); } .phl-toast.kind-info { --a: var(--sky); }
.phl-toast.kind-error { --a: var(--rose); }
@keyframes phl-toast-in { from { opacity: 0; transform: translateY(-0.8em) scale(0.94); } }

/* ---------- decorate bar ---------- */
.phl-decorate {
  position: absolute; left: var(--safe-l); right: var(--safe-r); margin-inline: auto; width: fit-content; bottom: var(--safe-b);
  display: flex; align-items: center; gap: 1em; padding: 0.55em 1.2em 0.55em 0.6em; border-radius: 1.3em;
  background: ${FELT}, linear-gradient(180deg, var(--panel-a), var(--panel-b)); box-shadow: 0 0.5em 1.4em rgba(38, 20, 16, 0.32);
  transition: opacity 0.25s, transform 0.25s;
}
.phl-decorate::before { content: ''; position: absolute; inset: 0.32em; border: 0.08em dashed var(--stitch); border-radius: 1em; pointer-events: none; }
.phl-decorate.is-hidden { opacity: 0; transform: translateY(1em); }
.phl-deco-icon { width: 3em; height: 3em; border-radius: 0.8em; background: rgba(255, 248, 239, 0.85); display: grid; place-items: center; flex: none;
  box-shadow: inset 0 0 0 0.14em var(--rc, #e9dccb); }
.phl-deco-icon svg { width: 2.6em; height: 2.6em; }
.phl-deco-name { font-weight: 900; font-size: 1.05em; white-space: nowrap; }
.phl-deco-count { font-size: 0.8em; font-weight: 800; color: var(--cream-2); }
.phl-deco-prompts { display: flex; flex-wrap: wrap; gap: 0.35em 0.9em; font-size: 0.85em; font-weight: 800; padding-left: 1em; border-left: 0.08em dashed var(--stitch); }
.phl-deco-prompts span { display: inline-flex; align-items: center; gap: 0.35em; white-space: nowrap; }

.phl-ui.is-reduced-motion *, .phl-ui.is-reduced-motion *::before, .phl-ui.is-reduced-motion *::after { animation-duration: 0.001s !important; transition-duration: 0.001s !important; }
@media (prefers-reduced-motion: reduce) {
  .phl-ui *, .phl-ui *::before, .phl-ui *::after { animation-duration: 0.001s !important; animation-iteration-count: 1 !important; transition-duration: 0.001s !important; }
}
@media (max-aspect-ratio: 1/1) {
  .phl-slot-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .phl-pause { flex-direction: column; }
  .phl-book-body { grid-template-columns: 1fr; grid-template-rows: minmax(0, 1.3fr) minmax(0, 1fr); }
  .phl-book, .phl-settings { max-height: none; }
  .phl-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); }
}
`;

let injected = false;
/** Injects the stylesheet once per document. */
export function injectStyles(doc = document) {
  if (injected && doc.getElementById('phl-ui-styles')) return;
  const style = doc.createElement('style');
  style.id = 'phl-ui-styles';
  style.textContent = CSS;
  doc.head.appendChild(style);
  injected = true;
}
