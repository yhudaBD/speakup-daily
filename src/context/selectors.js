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

// A practice attempt said out loud, not a sentence-completion answer.
// Records saved before `kind` existed are treated as spoken until §8 settles
// how to classify them (CRITICAL_REVIEW.md §8, a stage 5 decision).
export function isSpoken(sentence) {
  return sentence?.kind ? sentence.kind === "speak" : true;
}

// A conversation the user took part in with at least one turn of their own
// (spoken or typed, not a suggestion or translation). Records saved before
// ownTurnCount existed fall back to any user turn (D1).
function hasOwnTurn(chat) {
  const own = typeof chat?.ownTurnCount === "number" ? chat.ownTurnCount : chat?.turnCount;
  return (own || 0) > 0;
}

// D1: a day is active with at least one act of speaking, a sentence said
// in practice or a turn of the user's own in a conversation. The same rule
// feeds the streak, "days active" and the achievements.
export function isActiveDay(day) {
  if (!day) return false;
  return (day.sentences || []).some(isSpoken) || (day.chats || []).some(hasOwnTurn);
}

// Active days ever: the archive of pruned days plus the days still kept.
export function selectDaysActive(state) {
  const kept = Object.values(state?.sessions || {}).filter(isActiveDay).length;
  return (state?.archive?.daysActive || 0) + kept;
}
