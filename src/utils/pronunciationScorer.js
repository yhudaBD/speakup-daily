/**
 * pronunciationScorer.js
 * Pure function — compares spoken text vs original sentence
 * Returns: { score: 0-100, wordResults: [{word, status, matchScore}] }
 */

function normalizeText(text) {
  return text
    .toLowerCase()
    .replace(/[.,!?'"]/g, "")
    .trim();
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

function similarity(a, b) {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const dist = levenshtein(a, b);
  return 1 - dist / maxLen;
}

function findBestMatch(word, candidates) {
  let best = { score: 0, match: "" };
  for (const candidate of candidates) {
    const score = similarity(word, candidate);
    if (score > best.score) best = { score, match: candidate };
  }
  return best;
}

export function scorePronunciation(original, spoken) {
  const originalWords = normalizeText(original).split(/\s+/);
  const spokenWords = normalizeText(spoken || "").split(/\s+/);

  const wordResults = originalWords.map((word) => {
    const match = findBestMatch(word, spokenWords);
    let status = "incorrect";
    if (match.score > 0.85) status = "correct";
    else if (match.score > 0.55) status = "partial";
    return { word, status, matchScore: match.score };
  });

  const score = Math.round(
    (wordResults.reduce((sum, w) => sum + w.matchScore, 0) / originalWords.length) * 100
  );

  return { score: Math.min(100, Math.max(0, score)), wordResults };
}
