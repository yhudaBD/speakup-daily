// Values derived from the saved data, computed rather than stored
// (ACTION_PLAN.md, D5). A stored counter drifts from the data it summarizes;
// a pure function over the data fixes the past too when it's corrected.

// How the user made a chat turn (T4): "spoken" (said and transcribed),
// "typed", "suggestion" (a suggested reply), or "translated" (from "how do
// you say"). Turns saved before T4 have no source and count as unknown.
export const TURN_SOURCES = ["spoken", "typed", "suggestion", "translated"];

const validDuration = (ms) => typeof ms === "number" && Number.isFinite(ms) && ms > 0;

// Milliseconds the user spoke on their own in a conversation: spoken turns
// only. This feeds the North Star (minutes of independent speaking a week).
export function independentSpeakingMs(messages) {
  return (messages || [])
    .filter((m) => m?.role === "user" && m.source === "spoken" && validDuration(m.durationMs))
    .reduce((sum, m) => sum + m.durationMs, 0);
}

// Milliseconds spent reading sentences aloud in practice. Attempts saved
// before T4 have no duration and count as 0.
export function repeatSpeakingMs(sentences) {
  return (sentences || [])
    .filter((s) => validDuration(s?.durationMs))
    .reduce((sum, s) => sum + s.durationMs, 0);
}
