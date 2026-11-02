// A tiny synchronous event bus, the one channel between the game's systems (audio, save, UI, quests,
// creatures) so none imports another. Event names are listed in src/game/core/contracts.js.
export function createEvents() {
  const handlers = new Map();
  return {
    /** Subscribes; returns an unsubscribe function. */
    on(type, fn) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(fn);
      return () => handlers.get(type)?.delete(fn);
    },
    /** Subscribes for one call. */
    once(type, fn) {
      const off = this.on(type, (p) => { off(); fn(p); });
      return off;
    },
    emit(type, payload) {
      for (const fn of [...(handlers.get(type) ?? [])]) {
        try { fn(payload); } catch (e) { console.error(`[events] ${type} handler failed`, e); }
      }
    },
    clear() { handlers.clear(); },
  };
}
