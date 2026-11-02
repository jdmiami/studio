// The light puzzles, as pure state machines (the game renders them and feeds input).
//
// Felt lock (the great door): three dials of coloured wool, each turning through the same four
// colours; it opens when they read the riddle's answer. The riddle names "the friends who watch the
// door": the one who wags (Biscuit, cream), the knitted one (the knit dome, sage) and the one who
// hums (the lilac puff, lilac). After three wrong tries the door repeats the hint.
//
// Chime ring (each trip): mushrooms in a ring glow in a seeded sequence; touching them in that
// order releases a treasure. A wrong touch replays the sequence; the sequence grows by one after
// each correct round until the target length.
export const LOCK_COLORS = [
  { id: 'cream', label: 'Cream', hex: '#f1e6d6' },
  { id: 'sage', label: 'Sage', hex: '#a9c49a' },
  { id: 'lilac', label: 'Lilac', hex: '#b9a8d6' },
  { id: 'peach', label: 'Peach', hex: '#f0b79e' },
];
export const LOCK_ANSWER = ['cream', 'sage', 'lilac'];

export function createFeltLock({ dials = [0, 3, 1], answer = LOCK_ANSWER } = {}) {
  const state = { dials: [...dials], selected: 0, tries: 0, solved: false };
  const ids = () => state.dials.map((i) => LOCK_COLORS[i].id);
  return {
    state,
    select(delta) { state.selected = (state.selected + delta + 3) % 3; },
    turn(delta = 1) {
      if (state.solved) return;
      const i = state.selected;
      state.dials[i] = (state.dials[i] + delta + LOCK_COLORS.length) % LOCK_COLORS.length;
    },
    /** Pulls the lever: returns 'open' | 'wrong' | 'hint' (wrong, with the hint after 3 tries). */
    attempt() {
      if (state.solved) return 'open';
      if (ids().every((id, k) => id === answer[k])) { state.solved = true; return 'open'; }
      state.tries += 1;
      return state.tries % 3 === 0 ? 'hint' : 'wrong';
    },
    colors: ids,
  };
}

/** The chime ring: `count` mushrooms, a seeded sequence growing from `start` to `length`. */
export function createChimeRing({ rng, count = 4, start = 3, length = 5 }) {
  const full = Array.from({ length }, () => Math.floor(rng.float() * count));
  for (let i = 1; i < full.length; i++) if (full[i] === full[i - 1]) full[i] = (full[i] + 1) % count; // no repeats in a row
  const state = { round: start, input: [], solved: false, showing: true, mistakes: 0 };
  return {
    state,
    /** The sequence the ring plays this round. */
    sequence: () => full.slice(0, state.round),
    /** The player touched mushroom `i`: 'ok' | 'round' (round passed, next longer) | 'solved' | 'wrong'. */
    touch(i) {
      if (state.solved || state.showing) return 'ignored';
      const want = full[state.input.length];
      if (i !== want) { state.input = []; state.mistakes += 1; state.showing = true; return 'wrong'; }
      state.input.push(i);
      if (state.input.length < state.round) return 'ok';
      state.input = [];
      if (state.round >= length) { state.solved = true; return 'solved'; }
      state.round += 1;
      state.showing = true;
      return 'round';
    },
    shown() { state.showing = false; },
  };
}
