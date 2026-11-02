// The collection book: every ITEM as a cell on the left page (finds and sightings on their own
// tabs), unfound ones as soft "???" silhouettes, found ones as coloured felt glyphs with a rarity
// border and their count; the right page shows the focused entry. Progress "n / total" on a felt bar;
// switching tabs turns the page.
import { h, header, tabStrip } from '../dom.js';
import { collectionEntries, collectionProgress, formatDate } from '../logic.js';

const BIOMES = { hub: 'the Nest', meadow: 'Meadow Hills', grotto: 'Rose Grotto', lake: 'Blue Lake' };

export default {
  scrim: true,
  create(ctx, params) {
    const { items, RARITY, glyph } = ctx;
    let entries = [];
    let selected = params.itemId ?? null;
    const grid = h('div.phl-grid', { role: 'grid', 'data-focus-group': 'cells', 'data-focus-wrap': 'x' });
    const gridScroll = h('div.phl-scroll', { style: { flex: '1' } }, grid);
    const detail = h('div.phl-detail');
    const pageTitle = h('div.phl-page-title');
    const left = h('div.phl-page.phl-book-left', {}, pageTitle, gridScroll);
    const right = h('div.phl-page.phl-book-right', {}, h('div.phl-page-title', {}, 'Notes'), h('div.phl-scroll', { style: { flex: '1' } }, detail));
    const bookBody = h('div.phl-book-body', {}, left, right);
    const bar = h('div');
    const count = h('span');
    const progress = h('div.phl-progress', { 'aria-label': 'Collection progress' }, h('div.phl-felt-bar', {}, bar), count);
    const tabs = tabStrip([{ id: 'finds', label: 'Finds' }, { id: 'sightings', label: 'Sightings' }], params.tab ?? 'finds', (id) => { turn(id); render(); });
    const head = header('Collection', { onBack: () => ctx.back() });
    head.querySelector('.phl-header-titles').append(progress);
    const panel = h('div.phl-panel.phl-book', {}, head, tabs.el, bookBody);
    const el = h('div', {}, panel);

    function turn(id) {
      bookBody.classList.remove('is-turning', 'is-turning-back');
      void bookBody.offsetWidth;
      bookBody.classList.add('is-turning');
      if (id === 'finds') bookBody.classList.add('is-turning-back');
    }

    function showDetail(e) {
      if (!e) { detail.replaceChildren(h('div.phl-empty', {}, 'Nothing here yet.')); return; }
      const r = RARITY[e.item.rarity] ?? RARITY.common;
      if (!e.found) {
        const where = (e.item.biomes ?? []).map((b) => BIOMES[b] ?? b);
        detail.replaceChildren(
          h('div', { html: glyph(e.item.look, { silhouette: true }) }).firstElementChild,
          h('div.phl-detail-name', {}, '???'),
          h('span.phl-rarity', { style: { background: r.color } }, r.label),
          h('p.phl-detail-text', {}, e.item.story ? 'A treasure that turns up when the story needs it.'
            : where.length ? `${e.item.sighting ? 'Spotted' : 'Found'} around ${where.join(', ')}.` : 'Keep exploring.'),
        );
        return;
      }
      detail.replaceChildren(
        h('div', { html: glyph(e.item.look) }).firstElementChild,
        h('div.phl-detail-name', {}, e.item.name),
        h('span.phl-rarity', { style: { background: r.color } }, r.label),
        h('p.phl-detail-text', {}, e.item.text ?? ''),
        h('div.phl-detail-meta', {},
          e.item.sighting ? h('span', {}, 'Sighted') : h('span', {}, `Found ×${e.count}`),
          e.firstAt ? h('span', {}, `First ${formatDate(e.firstAt)}`) : null),
      );
    }

    function render() {
      const collection = ctx.getState()?.collection ?? {};
      const sighting = tabs.current() === 'sightings';
      entries = collectionEntries(collection, items, { sighting });
      const prog = collectionProgress(collection, items, { sighting });
      bar.style.width = `${prog.percent}%`;
      count.textContent = `${prog.label} ${sighting ? 'sighted' : 'found'}`;
      pageTitle.textContent = sighting ? 'Critters met' : 'Things found';
      if (!entries.find((e) => e.item.id === selected)) selected = entries[0]?.item.id ?? null;
      grid.replaceChildren(...entries.map((e) => {
        const r = RARITY[e.item.rarity] ?? RARITY.common;
        const cell = h(`button.phl-cell${e.found ? '' : '.is-unfound'}${e.item.id === selected ? '.is-selected' : ''}`, {
          type: 'button', 'data-focus': true, 'data-key': `item:${e.item.id}`, 'data-item': e.item.id, role: 'gridcell',
          'aria-label': e.found ? `${e.item.name}, ${r.label}${e.count > 1 ? `, ${e.count} found` : ''}` : 'Not found yet',
          html: glyph(e.item.look, { silhouette: !e.found }),
        });
        if (e.found) cell.style.setProperty('--rc', r.color);
        if (!e.found) cell.append(h('span.phl-cell-q', {}, '???'));
        else if (e.count > 1 && !e.item.sighting) cell.append(h('span.phl-cell-count', {}, `×${e.count}`));
        cell.addEventListener('click', () => select(e.item.id));
        return cell;
      }));
      showDetail(entries.find((e) => e.item.id === selected));
      ctx.refocus();
    }

    function select(id) {
      if (id === selected) return;
      selected = id;
      grid.querySelectorAll('.phl-cell').forEach((n) => n.classList.toggle('is-selected', n.dataset.item === id));
      showDetail(entries.find((e) => e.item.id === id));
    }

    render();
    return {
      el,
      tab: (d) => tabs.step(d),
      initialFocus: () => grid.querySelector('.is-selected') ?? grid.querySelector('[data-focus]'),
      onFocus(target) { if (target.dataset.item) select(target.dataset.item); },
      refresh: render,
    };
  },
};
