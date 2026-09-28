// Tracks whether the AI proxy has refused this account because it isn't on
// the beta list (403 not_in_beta, netlify/functions/_shared/betaAccess.js).
// ai.service.js reports it here, and BetaAccessBanner shows one clear
// message instead of every AI feature failing with a generic error.
const listeners = new Set();
let refused = false;

export function markNotInBeta() {
  if (refused) return;
  refused = true;
  for (const listener of listeners) listener();
}

export function isNotInBeta() {
  return refused;
}

// Returns an unsubscribe function.
export function onNotInBeta(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
