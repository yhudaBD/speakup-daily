import { attemptScores, isSpoken } from "../context/selectors";

/**
 * practiceHistory.js — derives review-worthy content from a user's session
 * history (state.sessions). Shared by Progress.jsx (the "Review" tab) and
 * Practice.jsx (weighting/selecting sentences for a new practice session).
 */

/**
 * Returns weak sentences keyed by sentenceId, each with { sentenceId, text,
 * translation, ..., count, bestScore }: count = how many times it's been
 * practiced, bestScore = the highest score it ever reached.
 *
 * Weak = failed (first try below threshold) at least once and not passed
 * `clearAfter` times in a row since (CRITICAL_REVIEW.md §7). Judged by the
 * first try, since a retry after hearing the sentence again isn't what the
 * user knows (§9). Only spoken sentences count: a sentence-completion answer
 * isn't a pronunciation attempt (§8). A minimal fix (D12): FSRS replaces it.
 */
export function getWeakSentenceStats(sessions, { threshold = 70, clearAfter = 2 } = {}) {
  const attempts = Object.entries(sessions || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([, day]) => day?.sentences || [])
    .filter(isSpoken);
  const byId = {};
  for (const x of attempts) {
    const { firstScore, bestScore } = attemptScores(x);
    const w = (byId[x.sentenceId] ||= { ...x, count: 0, bestScore: 0, fails: 0, passStreak: 0 });
    w.count++;
    w.bestScore = Math.max(w.bestScore, bestScore);
    if (firstScore < threshold) {
      w.fails++;
      w.passStreak = 0;
    } else {
      w.passStreak++;
    }
  }
  return Object.fromEntries(
    Object.entries(byId).filter(([, w]) => w.fails > 0 && w.passStreak < clearAfter),
  );
}

/**
 * Turns weak-sentence stats into practice-ready sentence objects (worst
 * first), for a dedicated "practice your weak spots" session. Reuses the
 * text/translation already stored with each past attempt, since a weak
 * sentence may have come from an AI-generated or word-bank source that
 * isn't in the static sentence bank.
 */
export function sentencesFromWeakList(weakStats, count = 5) {
  return Object.values(weakStats)
    .sort((a, b) => a.bestScore - b.bestScore)
    .slice(0, count)
    .map((w) => ({
      id: w.sentenceId,
      text: w.text,
      translation: w.translation || "",
      category: "review",
      difficulty: "medium",
      phonetic_tips: "",
    }));
}
