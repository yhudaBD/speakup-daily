/**
 * practiceHistory.js — derives review-worthy content from a user's session
 * history (state.sessions). Shared by Progress.jsx (the "Review" tab) and
 * Practice.jsx (weighting/selecting sentences for a new practice session).
 */

/**
 * Returns weak sentences (score below threshold) keyed by sentenceId, each
 * with { sentenceId, text, translation, score, count, bestScore } —
 * count = how many times it's been attempted below the threshold,
 * bestScore = the highest score achieved among those attempts.
 */
export function getWeakSentenceStats(sessions, { threshold = 70 } = {}) {
  const allSentences = Object.values(sessions || {}).flatMap((s) => s.sentences || []);
  return allSentences
    .filter((x) => x.score < threshold)
    .reduce((acc, x) => {
      const key = x.sentenceId;
      if (!acc[key]) acc[key] = { ...x, count: 0, bestScore: x.score };
      acc[key].count++;
      acc[key].bestScore = Math.max(acc[key].bestScore, x.score);
      return acc;
    }, {});
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
