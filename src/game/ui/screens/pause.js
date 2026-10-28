// Pause: Resume, Journal, Collection, Settings, Save, Quit to title (with a confirm), beside a
// little card about the current nest (place, play time, finds, quests).
import { h, button } from '../dom.js';
import { collectionProgress, formatPlayTime, locationLabel, questView } from '../logic.js';

export default {
  scrim: true,
  create(ctx) {
    const { actions } = ctx;
    const menu = h('div.phl-panel.phl-pause-menu', { role: 'menu' },
      h('h2.phl-title', { style: { marginBottom: '0.3em' } }, 'Paused'),
      button('Resume', () => ctx.close(), { key: 'resume', kind: 'primary', autofocus: true }),
      button('Journal', () => ctx.open('journal'), { key: 'journal' }),
      button('Collection', () => ctx.open('collection'), { key: 'collection' }),
      button('Settings', () => ctx.open('settings'), { key: 'settings' }),
      button('Save', save, { key: 'save', disabled: !actions.saveNow }),
      button('Quit to title', quit, { key: 'quit', kind: 'quiet' }));
    const card = h('div.phl-panel.phl-pause-card');
    const el = h('div', {}, h('div.phl-pause', {}, menu, card));

    function paintCard() {
      const st = ctx.getState();
      card.style.display = st ? '' : 'none';
      if (!st) return;
      const prog = collectionProgress(st.collection, ctx.items);
      const q = questView(st.quests, ctx.catalogue());
      const stat = (k, v) => h('div.phl-stat', {}, h('span', {}, k), h('span', {}, v));
      card.replaceChildren(
        h('div.phl-section-title', {}, 'Your nest'),
        h('div.phl-title', { style: { fontSize: '1.3em' } }, st.name ?? 'Nest'),
        stat('Where', locationLabel(st.area)),
        stat('Play time', formatPlayTime(st.playTime)),
        stat('Finds', prog.label),
        h('div.phl-mini-bar', {}, h('div', { style: { width: `${prog.percent}%` } })),
        stat('Quests', `${q.active.length} active · ${q.done.length} done`),
        q.active[0] ? h('div', { style: { marginTop: 'auto', fontSize: '0.85em', fontWeight: '700', color: 'var(--cream-2)' } },
          'Now: ', h('b', { style: { color: 'var(--butter)' } }, q.active[0].steps.find((s) => s.current)?.text ?? q.active[0].title)) : null,
      );
    }

    async function save() {
      try { await ctx.run(() => actions.saveNow?.()); ctx.toast('Nest saved', 'info'); } catch { /* toasted */ }
      paintCard();
    }
    async function quit() {
      const ok = await ctx.confirm({ title: 'Quit to title?', text: 'Anything since your last save will drift away like fluff.', confirmLabel: 'Quit', cancelLabel: 'Stay' });
      if (ok) ctx.quitToTitle();
    }

    paintCard();
    return { el, refresh: paintCard, onBack() { ctx.close(); return true; } };
  },
};
