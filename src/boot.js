// The page's entry: the game, unless a showcase or reference-matching flag asks for the cave
// viewer (src/main.js: ?scene=island, ?eye=, ?look=, ?view=cave; the matching scripts use these).
const params = new URLSearchParams(location.search);
const viewer = ['scene', 'eye', 'look', 'clear', 'view'].some((k) => params.has(k)) || (params.has('shot') && !params.has('game'));
await import(viewer ? './main.js' : './game/main.js');
