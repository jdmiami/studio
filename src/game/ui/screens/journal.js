// Journal: a felt book. Left page lists the quests (Active / Completed tabs), right page shows the
// selected quest's giver, description and steps (checked when done, the current one highlighted).
// Data: getState().quests joined with the quest catalogue (params.catalogue or setQuestCatalogue).
import { h, header, tabStrip } from '../dom.js';
import { questView } from '../logic.js';

export default {
  scrim: true,
  create(ctx, params) {
    let view = { active: [], done: [] };
    let selected = params.questId ?? null;
    const list = h('div.phl-scroll', { role: 'listbox', style: { flex: '1' }, 'data-focus-group': 'quests', 'data-focus-wrap': 'y' });
    const detail = h('div.phl-scroll', { style: { flex: '1' } });
    const leftTitle = h('div.phl-page-title');
    const left = h('div.phl-page.phl-book-left', {}, leftTitle, list);
    const right = h('div.phl-page.phl-book-right', {}, h('div.phl-page-title', {}, 'Details'), detail);
    const bookBody = h('div.phl-book-body', {}, left, right);
    const tabs = tabStrip([{ id: 'active', label: 'Active' }, { id: 'done', label: 'Completed' }], params.tab ?? 'active', () => { turn(); render(); });
    const panel = h('div.phl-panel.phl-book', {}, header('Journal', { sub: 'Errands, promises and little mysteries', onBack: () => ctx.back() }), tabs.el, bookBody);
    const el = h('div', {}, panel);

    let lastTab = tabs.current();
    function turn() {
      const back = tabs.current() === 'active' && lastTab === 'done';
      lastTab = tabs.current();
      bookBody.classList.remove('is-turning', 'is-turning-back');
      void bookBody.offsetWidth; // restart the animation
      bookBody.classList.add('is-turning');
      if (back) bookBody.classList.add('is-turning-back');
    }

    function load() {
      const catalogue = params.catalogue ?? ctx.catalogue();
      view = questView(ctx.getState()?.quests ?? {}, catalogue);
    }

    function showDetail(q) {
      if (!q) {
        detail.replaceChildren(h('div.phl-empty', {}, tabs.current() === 'active' ? 'Nothing on your list. Wander about and say hello to someone.' : 'Finished errands will be pressed here like flowers.'));
        return;
      }
      detail.replaceChildren(
        h('div.phl-q-title', {}, q.title),
        q.giver ? h('div.phl-q-giver', {}, `From ${q.giver}`) : h('div', { style: { height: '0.5em' } }),
        q.description ? h('p.phl-q-desc', {}, q.description) : null,
        h('ul.phl-steps', {}, q.steps.map((s) => h(`li.phl-step${s.done ? '.is-done' : ''}${s.current ? '.is-current' : ''}`, {
          'aria-label': `${s.text}${s.done ? ', done' : s.current ? ', current step' : ''}`,
        }, h('span.phl-check', { 'aria-hidden': 'true' }), h('span', {}, s.text)))),
      );
    }

    function render() {
      load();
      const quests = view[tabs.current()];
      tabs.el.querySelectorAll('.phl-tab').forEach((t, i) => { t.textContent = i ? `Completed (${view.done.length})` : `Active (${view.active.length})`; });
      leftTitle.textContent = tabs.current() === 'active' ? 'In progress' : 'All done';
      if (!quests.find((q) => q.id === selected)) selected = quests[0]?.id ?? null;
      list.replaceChildren(...(quests.length ? quests.map((q) => {
        const b = h(`button.phl-quest-item${q.id === selected ? '.is-selected' : ''}`, {
          type: 'button', 'data-focus': true, 'data-key': `quest:${q.id}`, 'data-quest': q.id, role: 'option',
        }, h(`span.phl-q-dot${q.status === 'done' ? '.is-done' : ''}`), h('span', {}, q.title), h('span.phl-q-prog', {}, q.progress));
        b.addEventListener('click', () => select(q.id));
        return b;
      }) : [h('div.phl-empty', {}, tabs.current() === 'active' ? 'No errands yet.' : 'None finished yet.')]));
      showDetail(quests.find((q) => q.id === selected));
      ctx.refocus();
    }

    function select(id) {
      if (id === selected) return;
      selected = id;
      list.querySelectorAll('.phl-quest-item').forEach((n) => n.classList.toggle('is-selected', n.dataset.quest === id));
      showDetail(view[tabs.current()].find((q) => q.id === id));
    }

    render();
    return {
      el,
      tab: (d) => tabs.step(d),
      initialFocus: () => list.querySelector('.is-selected') ?? list.querySelector('[data-focus]'),
      onFocus(target) { if (target.dataset.quest) select(target.dataset.quest); },
      refresh: render,
    };
  },
};
