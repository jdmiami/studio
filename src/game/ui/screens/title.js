// Title: the felt "Phluph" logo, a tagline, the main menu (Continue when a save exists, New Game,
// Load, Settings, Credits) over drifting fluff motes. Translucent, so the 3D backdrop shows through.
import { h, button } from '../dom.js';
import { prng, summarizeSlot } from '../logic.js';

const LETTERS = [
  { ch: 'P', c: '#eeb0ab', r: -6, y: '0em' }, { ch: 'h', c: '#9fc493', r: 4, y: '-0.08em' },
  { ch: 'l', c: '#efc979', r: -3, y: '0.02em' }, { ch: 'u', c: '#9fbfe6', r: 5, y: '-0.05em' },
  { ch: 'p', c: '#bda9d9', r: -4, y: '0.06em' }, { ch: 'h', c: '#efb79a', r: 6, y: '-0.02em' },
];

function motes(count = 34, seed = 7) {
  const rnd = prng(seed);
  const wrap = h('div.phl-motes');
  for (let i = 0; i < count; i++) {
    const size = 0.25 + rnd() * rnd() * 1.1;
    const m = h(`span.phl-mote${rnd() < 0.3 ? '.is-fluff' : ''}`);
    Object.assign(m.style, {
      left: `${(rnd() * 100).toFixed(1)}%`, top: `${(45 + rnd() * 65).toFixed(1)}%`, width: `${size.toFixed(2)}em`, height: `${size.toFixed(2)}em`,
    });
    m.style.setProperty('--d', `${(14 + rnd() * 18).toFixed(1)}s`);
    m.style.setProperty('--delay', `${(-rnd() * 30).toFixed(1)}s`);
    m.style.setProperty('--dx', `${((rnd() - 0.5) * 16).toFixed(1)}vw`);
    m.style.setProperty('--o', (0.35 + rnd() * 0.5).toFixed(2));
    wrap.appendChild(m);
  }
  return wrap;
}

async function listSlots(ctx) {
  try { return (await ctx.actions.listSlots?.()) ?? []; } catch { return []; }
}

export default {
  scrim: false,
  create(ctx) {
    const cont = button('Continue', () => ctx.run(() => ctx.actions.continueGame?.(), { started: true }), { key: 'continue', kind: 'primary', disabled: true });
    const newGame = button('New Game', () => ctx.open('slots', { mode: 'new' }), { key: 'new', autofocus: true });
    const menu = h('div.phl-panel.phl-title-menu', { role: 'menu' },
      cont, newGame,
      button('Load', () => ctx.open('slots', { mode: 'load' }), { key: 'load' }),
      button('Settings', () => ctx.open('settings'), { key: 'settings' }),
      button('Credits', () => ctx.open('credits'), { key: 'credits' }));

    const logo = h('h1.phl-logo', { 'aria-label': 'Phluph' }, LETTERS.map((l, i) => {
      const s = h('span.phl-logo-l', { 'aria-hidden': 'true' }, l.ch);
      s.style.setProperty('--c', l.c); s.style.setProperty('--r', `${l.r}deg`); s.style.setProperty('--y', l.y);
      s.style.setProperty('--bd', `${(-i * 0.55).toFixed(2)}s`);
      return s;
    }));

    const el = h('div.phl-title-screen', {},
      motes(),
      h('div.phl-title-wrap', {}, logo, h('div.phl-tagline', {}, 'a pocketful of felt and wonder'), menu),
      h('div.phl-title-hint', {},
        h('span', {}, h('span.phl-keycap', {}, '↑↓'), 'Choose'),
        h('span', {}, h('span.phl-keycap', {}, 'Enter'), 'Select'),
        h('span', {}, h('span.phl-keycap', {}, 'Esc'), 'Back')),
      h('div.phl-title-foot', {}, ctx.version));

    async function refresh() {
      const slots = (await listSlots(ctx)).map((s) => summarizeSlot(s, ctx.items));
      const hasSave = slots.some((s) => !s.empty);
      const was = cont.disabled;
      cont.disabled = !hasSave;
      // First time a save shows up, land on Continue.
      if (was && hasSave && (!ctx.focused() || ctx.focused() === newGame)) ctx.focus(cont, { silent: true });
      else ctx.refocus();
    }
    refresh();

    return { el, onBack: () => true, refresh };
  },
};
