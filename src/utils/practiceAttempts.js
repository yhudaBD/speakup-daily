// Every attempt at one practice sentence, until it's saved (CRITICAL_REVIEW.md
// §9). "Try again" used to drop the earlier attempts, so a sentence tried six
// times was saved as a first-time 92.

const validDuration = (ms) => typeof ms === "number" && Number.isFinite(ms) && ms > 0;

// Adds one scored attempt to the tally (null before the first attempt).
export function addAttempt(tally, { score, durationMs }) {
  return {
    firstScore: tally ? tally.firstScore : score,
    bestScore: tally ? Math.max(tally.bestScore, score) : score,
    attempts: (tally?.attempts || 0) + 1,
    durationMs: (tally?.durationMs || 0) + (validDuration(durationMs) ? durationMs : 0),
  };
}

// The fields a saved record gets from its tally. The duration covers every
// attempt, since each one was read aloud (T4).
export function attemptFields(tally) {
  const { firstScore, bestScore, attempts, durationMs } = tally;
  return {
    firstScore,
    bestScore,
    attempts,
    ...(durationMs > 0 ? { durationMs: Math.round(durationMs) } : {}),
  };
}
