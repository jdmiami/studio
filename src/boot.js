// The page's entry: the game, unless a showcase or reference-matching flag asks for the cave
// viewer (src/main.js: ?scene=island, ?eye=, ?look=, ?view=cave; the matching scripts use these).
// Each import is a literal, so the bundler builds both as chunks (an import of a computed path is
// left unbundled and fails in production).
const params = new URLSearchParams(location.search);
const viewer = ['scene', 'eye', 'look', 'clear', 'view'].some((k) => params.has(k)) || (params.has('shot') && !params.has('game'));
if (viewer) await import('./main.js');
else await import('./game/main.js');
