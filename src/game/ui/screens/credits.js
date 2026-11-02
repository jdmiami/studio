// Credits: a short, warm roll.
import { h, header } from '../dom.js';

const ROLL = [
  ['Made by', 'The Phluph team'],
  ['World', 'Painted in felt, wool and pastel light'],
  ['Built with', 'three.js and Vite'],
  ['Type', 'Nunito, or whatever round letters your computer keeps'],
  ['Thank you', 'To everyone who ever kept a pocketful of pebbles'],
];

export default {
  scrim: true,
  create(ctx) {
    const roll = h('div.phl-credits-roll', {},
      ROLL.map(([k, v]) => h('div', {}, h('h3', {}, k), h('p', {}, v))),
      h('p.phl-small', {}, `Phluph ${ctx.version} · stitched with care`));
    const panel = h('div.phl-panel.phl-credits', {}, header('Credits', { onBack: () => ctx.back() }), h('div.phl-scroll', {}, roll));
    return { el: h('div', {}, panel) };
  },
};
