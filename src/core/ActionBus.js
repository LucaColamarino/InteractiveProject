// Pub/Sub super leggero per azioni di gioco
export const ActionBus = {
  _subs: new Map(), // action -> Set<fn>
  on(action, fn) {
    if (!this._subs.has(action)) this._subs.set(action, new Set());
    this._subs.get(action).add(fn);
    return () => this._subs.get(action)?.delete(fn);
  },
  emit(action, payload) {
    const subs = this._subs.get(action);
    if (!subs) return;
    for (const fn of subs) fn(payload);
  }
};
