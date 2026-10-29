// Settings with three tabs. Audio: master / sfx / ambience / ui volume. Controls: mouse and pad
// sensitivity, invert Y, deadzone, and the rebinding list (two bindings per action, captured through
// actions.startRebind; reset through actions.resetBindings). Video: FOV, quality, head bob, camera
// shake, FPS counter and menu text size. Every change applies live (actions.applySettings +
// EVENTS.SETTINGS_CHANGED).
import { ACTIONS } from '../../core/contracts.js';
import { h, button, header, row, slider, stepper, tabStrip, toggle } from '../dom.js';
import { prettyAction } from '../logic.js';

export const REBINDABLE = [
  ACTIONS.MOVE_FORWARD, ACTIONS.MOVE_BACK, ACTIONS.MOVE_LEFT, ACTIONS.MOVE_RIGHT, ACTIONS.JUMP, ACTIONS.RUN,
  ACTIONS.INTERACT, ACTIONS.THROW, ACTIONS.PICK_UP, ACTIONS.DECORATE, ACTIONS.ROTATE,
  ACTIONS.JOURNAL, ACTIONS.COLLECTION, ACTIONS.PAUSE,
];
const TABS = [{ id: 'audio', label: 'Audio' }, { id: 'controls', label: 'Controls' }, { id: 'video', label: 'Video' }];
const pct = (v) => `${Math.round(v * 100)}%`;
const times = (v) => `${v.toFixed(2)}×`;

/** Labels from actions.labelFor(action): a string ("W / Up") or an array, one per binding index. */
export function bindingLabels(labelFor, action) {
  let l = null;
  try { l = labelFor?.(action); } catch { l = null; }
  if (Array.isArray(l)) return l.map((x) => (x == null ? '' : String(x)));
  if (l == null || l === '') return [];
  return String(l).split(/\s*\/\s*|\s*,\s*/).filter(Boolean);
}

export default {
  scrim: true,
  create(ctx, params) {
    const { actions } = ctx;
    let s = ctx.settings();
    const body = h('div.phl-scroll.phl-settings-body', { role: 'tabpanel' });
    const tabs = tabStrip(TABS, params.tab ?? 'audio', () => render());
    const foot = h('div.phl-settings-foot', {}, h('span', {}, 'Changes apply right away.'));
    const panel = h('div.phl-panel.phl-settings', {}, header('Settings', { onBack: () => ctx.back() }), tabs.el, body, foot);
    const el = h('div', {}, panel);

    const set = (mutate) => { s = ctx.settings(); mutate(s); ctx.applySettings(s); };

    function audio() {
      const v = s.volume ?? {};
      const vol = (key, label, hint) => row(label, slider({
        key: `vol:${key}`, label, value: v[key] ?? 0.8, min: 0, max: 1, step: 0.05, format: pct,
        onChange: (x) => set((n) => { n.volume = { ...n.volume, [key]: x }; }),
      }), hint);
      return [h('div.phl-section-title', {}, 'Volume'),
        vol('master', 'Master'), vol('sfx', 'Sound effects', 'Footsteps, finds, squeaks'), vol('ambience', 'Ambience', 'Cave hum, water, wind'), vol('ui', 'Menus', 'Clicks and page turns')];
    }

    function bindRows() {
      return REBINDABLE.map((action) => {
        const labels = bindingLabels(actions.labelFor, action);
        const slots = [0, 1].map((i) => {
          const label = labels[i] ?? '';
          const b = h(`button.phl-bind${label ? '' : '.is-empty'}`, {
            type: 'button', 'data-focus': true, 'data-key': `bind:${action}:${i}`, 'aria-label': `${prettyAction(action)} binding ${i + 1}`,
          }, label || (i ? 'Add' : '—'));
          b.addEventListener('click', () => rebind(action, i, b));
          return b;
        });
        return h('div.phl-bind-row', {}, h('span.phl-bind-name', {}, prettyAction(action)), slots);
      });
    }

    async function rebind(action, index, b) {
      if (!actions.startRebind) { ctx.toast('Rebinding is not available here', 'error'); return; }
      b.classList.add('is-capturing');
      b.textContent = 'Press a key…';
      ctx.setCapturing(true);
      try { await actions.startRebind(action, index); } catch { /* cancelled */ }
      // Let the key that finished capture pass before menus listen again.
      setTimeout(() => { ctx.setCapturing(false); render(); }, 80);
    }

    function controls() {
      return [
        h('div.phl-section-title', {}, 'Look'),
        row('Mouse sensitivity', slider({ key: 'mouseSens', label: 'Mouse sensitivity', value: s.mouseSensitivity ?? 1, min: 0.2, max: 3, step: 0.05, format: times,
          onChange: (x) => set((n) => { n.mouseSensitivity = x; }) })),
        row('Invert Y', toggle({ key: 'invertY', label: 'Invert Y', value: s.invertY, onChange: (x) => set((n) => { n.invertY = x; }) }), 'Push up to look down'),
        row('Pad look sensitivity', slider({ key: 'padSens', label: 'Pad look sensitivity', value: s.lookSensitivityPad ?? 1, min: 0.2, max: 3, step: 0.05, format: times,
          onChange: (x) => set((n) => { n.lookSensitivityPad = x; }) })),
        row('Stick deadzone', slider({ key: 'deadzone', label: 'Stick deadzone', value: s.gamepadDeadzone ?? 0.18, min: 0, max: 0.5, step: 0.01, format: pct,
          onChange: (x) => set((n) => { n.gamepadDeadzone = x; }) }), 'Raise it if the view drifts'),
        h('div.phl-section-title', {}, 'Touch'),
        row('On-screen controls', stepper({ key: 'touchControls', label: 'On-screen controls', value: s.touchControls ?? 'auto',
          options: [{ value: 'auto', label: 'Auto' }, { value: 'on', label: 'On' }, { value: 'off', label: 'Off' }],
          onChange: (x) => set((n) => { n.touchControls = x; }) }), 'Auto shows them on touch screens'),
        row('Touch look speed', slider({ key: 'touchSens', label: 'Touch look speed', value: s.touchLookSensitivity ?? 1, min: 0.3, max: 3, step: 0.05, format: times,
          onChange: (x) => set((n) => { n.touchLookSensitivity = x; }) })),
        row('Button size', slider({ key: 'touchScale', label: 'Button size', value: s.touchButtonScale ?? 1, min: 0.7, max: 1.6, step: 0.05, format: times,
          onChange: (x) => set((n) => { n.touchButtonScale = x; }) })),
        h('div.phl-section-title', {}, 'Bindings'),
        ...bindRows(),
        h('div', { style: { display: 'flex', justifyContent: 'center', marginTop: '0.7em' } },
          button('Reset bindings', async () => {
            const ok = await ctx.confirm({ title: 'Reset all bindings?', text: 'Every key and button goes back to how it came out of the box.', confirmLabel: 'Reset' });
            if (!ok) return;
            try { await ctx.run(() => actions.resetBindings?.()); ctx.toast('Controls reset', 'info'); } catch { /* toasted */ }
            s = ctx.settings();
            render();
          }, { key: 'resetBindings', kind: 'quiet', disabled: !actions.resetBindings })),
      ];
    }

    function video() {
      return [
        h('div.phl-section-title', {}, 'View'),
        row('Field of view', slider({ key: 'fov', label: 'Field of view', value: s.fov ?? 70, min: 60, max: 100, step: 1, format: (v) => `${Math.round(v)}°`,
          onChange: (x) => set((n) => { n.fov = x; }) })),
        row('Quality', stepper({ key: 'quality', label: 'Quality', value: s.quality ?? 'high',
          options: [{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }],
          onChange: (x) => set((n) => { n.quality = x; }) }), 'Lower it if things feel slow'),
        row('Head bob', toggle({ key: 'headBob', label: 'Head bob', value: s.headBob ?? true, onChange: (x) => set((n) => { n.headBob = x; }) })),
        row('Camera shake', toggle({ key: 'cameraShake', label: 'Camera shake', value: s.cameraShake ?? true, onChange: (x) => set((n) => { n.cameraShake = x; }) })),
        row('Show FPS', toggle({ key: 'showFps', label: 'Show FPS', value: !!s.showFps, onChange: (x) => set((n) => { n.showFps = x; }) })),
        h('div.phl-section-title', {}, 'Comfort'),
        row('Menu text size', stepper({ key: 'uiScale', label: 'Menu text size', value: s.uiScale ?? 1,
          options: [{ value: 0.9, label: 'Small' }, { value: 1, label: 'Normal' }, { value: 1.15, label: 'Large' }, { value: 1.3, label: 'Huge' }],
          onChange: (x) => set((n) => { n.uiScale = x; }) })),
      ];
    }

    function render() {
      s = ctx.settings();
      const id = tabs.current();
      body.replaceChildren(...(id === 'audio' ? audio() : id === 'controls' ? controls() : video()));
      body.scrollTop = 0;
      ctx.refocus();
    }

    render();
    return {
      el,
      tab: (d) => { tabs.step(d); },
      initialFocus: () => body.querySelector('[data-focus]'),
      refresh: () => { s = ctx.settings(); },
    };
  },
};
