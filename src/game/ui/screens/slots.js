// Save slots: the autosave card and three slot cards (name, play time, location, finds, quests,
// last saved), plus an action row for the selected card: Load, New, Delete (confirm), Export (a
// copyable code) and Import (a paste box). params.mode: 'new' (from New Game) or 'load'.
import { h, button, header } from '../dom.js';
import { defaultSlotName, formatPlayTime, formatRelativeTime, summarizeSlot } from '../logic.js';

const SLOT_IDS = ['auto', 1, 2, 3];

export default {
  scrim: true,
  create(ctx, params) {
    const mode = params.mode ?? 'load';
    const { actions } = ctx;
    let cards = [];
    let selected = params.select ?? null;

    const grid = h('div.phl-slot-grid', { role: 'listbox', 'data-focus-group': 'cards', 'data-focus-wrap': 'x' });
    const btn = {
      load: button('Load', () => sel() && load(sel()), { key: 'act:load', kind: 'primary' }),
      fresh: button('New game', () => sel() && startNew(sel()), { key: 'act:new' }),
      del: button('Delete', () => sel() && remove(sel()), { key: 'act:delete', kind: 'danger' }),
      exp: button('Export', () => sel() && exportSlot(sel()), { key: 'act:export' }),
      imp: button('Import', () => sel() && importSlot(sel()), { key: 'act:import' }),
    };
    const bar = h('div.phl-slot-actions', { 'data-focus-group': 'slot-actions', 'data-focus-wrap': 'x' }, Object.values(btn));
    const panel = h('div.phl-panel.phl-slots', {},
      header(mode === 'new' ? 'New game' : 'Your nests', {
        sub: mode === 'new' ? 'Pick a slot for your new nest' : 'Pick up where you left off',
        onBack: () => ctx.back(),
      }),
      h('div.phl-scroll', {}, grid), bar);
    const el = h('div', {}, panel);

    const sel = () => cards.find((c) => String(c.slot) === String(selected)) ?? null;
    const slotLabel = (c) => (c.auto ? 'Autosave' : `Slot ${c.slot}`);

    function paintBar() {
      const c = sel();
      btn.load.disabled = !c || c.empty;
      btn.fresh.disabled = !c || c.auto;
      btn.del.disabled = !c || c.empty || c.auto;
      btn.exp.disabled = !c || c.empty || !actions.exportSlot;
      btn.imp.disabled = !c || c.auto || !actions.importSlot;
      grid.querySelectorAll('.phl-slot').forEach((n) => n.classList.toggle('is-selected', n.dataset.slot === String(selected)));
    }

    function card(c) {
      const meta = (k, v) => h('div.phl-slot-meta', {}, h('span', {}, k), h('span', {}, v));
      const body = c.empty
        ? [h('span.phl-slot-tag', {}, slotLabel(c)), h('div', { style: { flex: '1' } }),
          h('div.phl-slot-plus', {}, c.auto ? '…' : '+'),
          h('div.phl-slot-empty-text', {}, c.auto ? 'No autosave yet' : 'Start a new nest'), h('div', { style: { flex: '1' } })]
        : [h('span.phl-slot-tag', {}, slotLabel(c)),
          h('div.phl-slot-name', { title: c.name }, c.name),
          meta('Play time', formatPlayTime(c.playTime)),
          meta('Where', c.location),
          meta('Finds', `${c.finds} / ${c.total}`),
          meta('Quests done', String(c.questsDone)),
          h('div.phl-slot-saved', {}, `Saved ${formatRelativeTime(c.savedAt)}`)];
      const n = h(`button.phl-slot${c.auto ? '.is-auto' : ''}${c.empty ? '.is-empty' : ''}`, {
        type: 'button', 'data-focus': true, 'data-key': `slot:${c.slot}`, 'data-slot': String(c.slot), role: 'option',
        disabled: c.auto && c.empty, 'aria-label': `${slotLabel(c)}${c.empty ? ', empty' : `, ${c.name}`}`,
      }, body);
      n.addEventListener('click', () => primary(c));
      return n;
    }

    function render(list) {
      cards = SLOT_IDS.map((id) => {
        const raw = list.find((s) => (id === 'auto' ? s.slot === 'auto' || s.slot === 'autosave' || s.auto : String(s.slot) === String(id)));
        const c = summarizeSlot(raw ?? { slot: id, empty: true }, ctx.items);
        c.slot = id; c.auto = id === 'auto';
        return c;
      });
      grid.innerHTML = '';
      cards.forEach((c) => grid.appendChild(card(c)));
      if (selected == null || !sel()) {
        const firstFilled = cards.find((c) => !c.empty && !c.auto);
        const firstEmpty = cards.find((c) => c.empty && !c.auto);
        selected = (mode === 'new' ? firstEmpty ?? cards[1] : firstFilled ?? cards.find((c) => !c.empty) ?? cards[1]).slot;
      }
      paintBar();
      // The cards arrive after open() focused the screen: land on the selected card the first time.
      const target = firstRender ? grid.querySelector(`[data-slot="${selected}"]:not([disabled])`) : null;
      firstRender = false;
      if (target) ctx.focus(target, { silent: true, source: 'auto' }); else ctx.refocus();
    }
    let firstRender = true;

    async function reload() {
      let list = [];
      try { list = (await actions.listSlots?.()) ?? []; } catch (e) { console.error(e); }
      render(list);
    }

    // ---- flows
    async function load(c) {
      if (c.empty) return startNew(c);
      await ctx.run(() => actions.loadSlot?.(c.slot), { started: true }).catch(() => {});
    }
    async function startNew(c) {
      if (c.auto) return;
      if (!c.empty) {
        const ok = await ctx.confirm({ title: `Replace “${c.name}”?`, text: 'Starting fresh here unravels the nest saved in this slot.', confirmLabel: 'Replace', danger: true });
        if (!ok) return;
      }
      const name = await ctx.prompt({ title: 'Name your nest', text: 'What should we stitch on the door?', value: defaultSlotName(c.slot), confirmLabel: 'Start' });
      if (name == null) return;
      const clean = name.trim().slice(0, 24) || defaultSlotName(c.slot);
      await ctx.run(() => actions.newGame?.(c.slot, clean), { started: true }).catch(() => {});
    }
    async function remove(c) {
      const ok = await ctx.confirm({ title: `Delete “${c.name}”?`, text: 'This nest and everything in it will be unravelled for good.', confirmLabel: 'Delete', danger: true });
      if (!ok) return;
      try { await ctx.run(() => actions.deleteSlot?.(c.slot)); ctx.toast(`${slotLabel(c)} is empty again`, 'info'); } catch { /* toasted */ }
      reload();
    }
    async function exportSlot(c) {
      let code;
      try { code = await ctx.run(() => actions.exportSlot(c.slot)); } catch { return; }
      await ctx.showCode({ title: 'Export code', text: `A copy of “${c.name}”. Keep it safe, or paste it into Import on another computer.`, code });
    }
    async function importSlot(c) {
      if (!c.empty) {
        const ok = await ctx.confirm({ title: `Import over “${c.name}”?`, text: 'The imported nest replaces this one.', confirmLabel: 'Import here', danger: true });
        if (!ok) return;
      }
      const text = await ctx.prompt({ title: 'Import a nest', text: 'Paste an export code below.', multiline: true, placeholder: 'Paste the code here…', confirmLabel: 'Import' });
      if (!text || !text.trim()) return;
      try { await ctx.run(() => actions.importSlot(c.slot, text.trim())); ctx.toast(`Imported into ${slotLabel(c)}`, 'info'); } catch { /* toasted */ }
      reload();
    }
    function primary(c) {
      selected = c.slot;
      paintBar();
      if (c.auto) { if (!c.empty) load(c); return; }
      if (mode === 'new' || c.empty) startNew(c); else load(c);
    }

    reload();
    return {
      el,
      initialFocus: () => grid.querySelector(`[data-slot="${selected}"]:not([disabled])`) ?? grid.querySelector('.phl-slot:not([disabled])'),
      onFocus(target) {
        if (target.dataset.slot != null && target.dataset.slot !== String(selected)) {
          selected = cards.find((c) => String(c.slot) === target.dataset.slot)?.slot ?? selected;
          paintBar();
        }
      },
      refresh: reload,
    };
  },
};
