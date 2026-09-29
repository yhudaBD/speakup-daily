import { addDays, parseDateKey, toDateKey } from "../utils/dateHelpers";
import { sentenceKind } from "./migrations";

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

// Share of a conversation's user turns that came from a suggestion or a
// translation. Turns saved before T4 have no source and count as the user's.
// ADJUST_LEVEL won't raise the level on a conversation above 30% (§5 fix #4).
export function helpedTurnShare(messages) {
  const turns = (messages || []).filter((m) => m?.role === "user");
  if (!turns.length) return 0;
  return turns.filter((m) => m.source === "suggestion" || m.source === "translated").length / turns.length;
}

// A conversation says something about the user's level only with at least
// MIN_OWN_TURNS_FOR_LEVEL turns of their own, spoken or typed
// (CRITICAL_REVIEW.md §14). Turns saved before T4 count as their own.
export const MIN_OWN_TURNS_FOR_LEVEL = 4;

export function ownTurns(messages) {
  return (messages || []).filter(
    (m) => m?.role === "user" && (!m.source || m.source === "spoken" || m.source === "typed"),
  ).length;
}

// The ADJUST_LEVEL payload for an analyzed conversation, or null when it
// shouldn't move the level.
export function levelAdjustment(messages, feedback) {
  if (typeof feedback?.overall_score !== "number") return null;
  if (ownTurns(messages) < MIN_OWN_TURNS_FOR_LEVEL) return null;
  return { score: feedback.overall_score, helpedShare: helpedTurnShare(messages) };
}

// Milliseconds spent reading sentences aloud in practice. Attempts saved
// before T4 have no duration and count as 0.
export function repeatSpeakingMs(sentences) {
  return (sentences || [])
    .filter((s) => validDuration(s?.durationMs))
    .reduce((sum, s) => sum + s.durationMs, 0);
}

// First score, best score and number of attempts of a saved practice record
// (CRITICAL_REVIEW.md §9). Records saved before these fields existed kept only
// one attempt, so their score is both the first and the best.
export function attemptScores(sentence) {
  const score = sentence?.score ?? 0;
  return {
    firstScore: sentence?.firstScore ?? score,
    bestScore: sentence?.bestScore ?? score,
    attempts: sentence?.attempts ?? 1,
  };
}

// A practice attempt said out loud, not a sentence-completion answer
// (CRITICAL_REVIEW.md §8). Records without `kind` follow the migration's rule.
export function isSpoken(sentence) {
  return sentenceKind(sentence) === "speak";
}

const isCloze = (sentence) => sentenceKind(sentence) === "cloze";
const keptSentences = (state) => Object.values(state?.sessions || {}).flatMap((d) => d?.sentences || []);
const averageScore = (list) =>
  list.length ? Math.round(list.reduce((sum, s) => sum + (s.score || 0), 0) / list.length) : null;

// Average pronunciation score of the spoken sentences in a list, or null when
// there are none. Sentence-completion answers score 100 or 0 and would
// distort it (§8).
export function speakAverage(sentences) {
  return averageScore((sentences || []).filter(isSpoken));
}

// Average pronunciation score over the days still kept.
export function selectSpeakAverage(state) {
  return speakAverage(keptSentences(state));
}

// Spoken sentences that scored 90 or more, ever: the archive of pruned days
// plus the days still kept. Archives folded before §8 have no count.
export function selectSentencesAbove90(state) {
  const kept = keptSentences(state).filter((s) => isSpoken(s) && s.score >= 90).length;
  return (state?.archive?.speakAbove90 || 0) + kept;
}

// Sentence completion's own numbers over the days still kept.
export function selectClozeStats(state) {
  const answers = keptSentences(state).filter(isCloze);
  return {
    answers: answers.length,
    correct: answers.filter((s) => s.score === 100).length,
    average: averageScore(answers),
  };
}

// A conversation the user took part in with at least one turn of their own
// (spoken or typed, not a suggestion or translation). Records saved before
// ownTurnCount existed fall back to any user turn (D1).
function hasOwnTurn(chat) {
  const own = typeof chat?.ownTurnCount === "number" ? chat.ownTurnCount : chat?.turnCount;
  return (own || 0) > 0;
}

// A finished conversation: at least MIN_CHAT_TURNS user turns. A shorter one
// is saved as "abandoned"; it doesn't advance the plan or count as a
// conversation, though one turn of the user's own still makes the day active
// (CRITICAL_REVIEW.md §16).
export const MIN_CHAT_TURNS = 3;

export function isCompletedChat(chat) {
  if (chat?.status === "abandoned") return false;
  return (chat?.turnCount || 0) >= MIN_CHAT_TURNS;
}

// Finished conversations ever: the archive plus the days still kept.
// Archives folded before §16 only counted all conversations.
export function selectTotalChats(state) {
  const kept = Object.values(state?.sessions || {})
    .flatMap((d) => d?.chats || [])
    .filter(isCompletedChat).length;
  const archive = state?.archive;
  return (archive ? archive.completedChats ?? archive.chats ?? 0 : 0) + kept;
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

const dayBefore = (dateKey) => toDateKey(addDays(parseDateKey(dateKey), -1));

// The run of consecutive active days ending at the last active one, and
// that day. Derived from the days, so merging two devices' days gives the
// right streak without copying either side's counter (CRITICAL_REVIEW.md §2א).
export function streakRun(sessions) {
  const active = new Set(Object.keys(sessions || {}).filter((d) => isActiveDay(sessions[d])));
  if (!active.size) return { current: 0, lastPracticeDate: null };
  const last = [...active].sort().at(-1);
  let current = 0;
  for (let day = last; active.has(day); day = dayBefore(day)) current++;
  return { current, lastPracticeDate: last };
}

// The sentences practiced on `today`, the daily goal's progress. Derived
// rather than kept in state, so it resets at midnight (CRITICAL_REVIEW.md §28).
export function selectTodayProgress(state, today) {
  return state?.sessions?.[today]?.sentences || [];
}

// The streak to show on `today`: the run, while its last day is today or
// yesterday, otherwise 0 (§19 uses this for display).
export function selectStreak(state, today) {
  const { current, lastPracticeDate } = streakRun(state?.sessions);
  return lastPracticeDate === today || lastPracticeDate === dayBefore(today) ? current : 0;
}
