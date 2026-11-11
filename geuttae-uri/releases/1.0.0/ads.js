// The native SDK owns consent, test/live IDs and the final frequency limit.
// Only explicit transitions away from a successfully completed real game may show an ad.
export function createGameBreakGate(show, now = Date.now) {
  const attempted = new Set();
  let busy = false, lastShown = -Infinity;
  return async function atGameBreak(state, next) {
    if (busy) return false;
    busy = true;
    try {
      const key = state.code + ':' + (state.gameNumber || 0);
      if (!state.demo && state.code && state.view?.phase === 'finished' &&
          state.view.endReason === 'completed' && !attempted.has(key) && now() - lastShown >= 300_000) {
        attempted.add(key);
        // Bound bookkeeping even across very long app sessions.
        if (attempted.size > 100) attempted.delete(attempted.values().next().value);
        try {
          const result = await show({placement: 'completed-game', breakKey: key});
          if (result?.shown) lastShown = now();
        } catch { /* No-fill, a disabled SDK or an SDK error must not block the next game. */ }
      }
      await next();
      return true;
    } finally { busy = false; }
  };
}
