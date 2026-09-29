/**
 * pronunciationScorer.js
 * Pure function — compares what the speech engine heard with the sentence.
 * Returns: { score: 0-100, wordResults: [{word, status, matchScore}] }
 *
 * The engines guess the likely word, so this measures how clearly the user
 * spoke (was understood), not pronunciation as such; the screen says so
 * (CRITICAL_REVIEW.md §4). Words are aligned in order, each heard word used
 * at most once, and extra words cost half a word each. Both sides are
 * normalized first: contractions expanded, numbers spelled out.
 */

const MATCH_FLOOR = 0.55; // below this a word isn't the target word at all
const INSERTION_WEIGHT = 0.5;

const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

// 0-999 as words; larger numbers stay as digits.
function numberWords(n) {
  if (n < 20) return [ONES[n]];
  if (n < 100) return [TENS[Math.floor(n / 10)], ...(n % 10 ? [ONES[n % 10]] : [])];
  if (n < 1000) return [ONES[Math.floor(n / 100)], "hundred", ...(n % 100 ? numberWords(n % 100) : [])];
  return [String(n)];
}

const IRREGULAR = {
  "can't": ["can", "not"], cannot: ["can", "not"], "won't": ["will", "not"],
  "shan't": ["shall", "not"], "ain't": ["is", "not"], "let's": ["let", "us"],
};
const CONTRACTION_ENDINGS = { m: "am", re: "are", ve: "have", ll: "will", d: "would" };
// 's is "is" only after these; elsewhere it's usually a possessive.
const S_IS = new Set(["it", "that", "what", "he", "she", "there", "here", "who", "where", "how"]);

function expandWord(word) {
  if (IRREGULAR[word]) return IRREGULAR[word];
  if (/^\d+$/.test(word)) return numberWords(Number(word));
  if (word.endsWith("n't")) return [word.slice(0, -3), "not"];
  const m = word.match(/^([a-z]+)'([a-z]+)$/);
  if (m && CONTRACTION_ENDINGS[m[2]]) return [m[1], CONTRACTION_ENDINGS[m[2]]];
  if (m && m[2] === "s" && S_IS.has(m[1])) return [m[1], "is"];
  return [word.replace(/'/g, "")];
}

// One written token ("don't", "bus-stop?", "5") → its normalized words.
function normalizeToken(token) {
  return token
    .toLowerCase()
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/[-‐-―]/g, " ")
    .replace(/[^a-z0-9' ]/g, "")
    .split(/\s+/)
    .map((w) => w.replace(/^'+|'+$/g, ""))
    .filter(Boolean)
    .flatMap(expandWord);
}

const tokensOf = (text) => (text || "").split(/\s+/).filter(Boolean);

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
  return 1 - levenshtein(a, b) / maxLen;
}

// Word-level alignment (edit distance with substitution cost 1 - similarity).
// Returns each target word's similarity to the heard word aligned with it
// (0 when it was left out), that heard word's index (-1 when left out), and
// how many heard words were extra.
function alignWords(target, heard) {
  const m = target.length, n = heard.length;
  const sim = target.map((t) => heard.map((h) => similarity(t, h)));
  const dp = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => i + j));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(dp[i - 1][j - 1] + 1 - sim[i - 1][j - 1], dp[i - 1][j] + 1, dp[i][j - 1] + 1);
    }
  }
  const matched = Array(m).fill(0);
  const heardIndex = Array(m).fill(-1);
  let insertions = 0;
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1 - sim[i - 1][j - 1]) {
      matched[i - 1] = sim[i - 1][j - 1];
      heardIndex[i - 1] = j - 1;
      i--; j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      i--;
    } else {
      insertions++;
      j--;
    }
  }
  return { matched, heardIndex, insertions };
}

export function scorePronunciation(original, spoken) {
  const tokens = tokensOf(original)
    .map((token) => ({ token, parts: normalizeToken(token) }))
    .filter((t) => t.parts.length);
  const target = tokens.flatMap((t) => t.parts);
  const heard = tokensOf(spoken).flatMap(normalizeToken);
  if (!target.length) return { score: 0, wordResults: [] };

  const { matched, heardIndex, insertions } = alignWords(target, heard);
  // An unrelated word in the target's place earns nothing.
  const credit = matched.map((s) => (s > MATCH_FLOOR ? s : 0));

  let k = 0;
  const wordResults = tokens.map(({ token, parts }) => {
    const scores = credit.slice(k, k + parts.length);
    // What was heard in this word's place, for the word help card.
    const heardHere = heardIndex.slice(k, k + parts.length).filter((j) => j >= 0).map((j) => heard[j]);
    k += parts.length;
    const matchScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    let status = "incorrect";
    if (matchScore > 0.85) status = "correct";
    else if (matchScore > MATCH_FLOOR) status = "partial";
    return { word: token.replace(/^[^\w']+|[^\w']+$/g, ""), status, matchScore, heard: heardHere.join(" ") };
  });

  const total = credit.reduce((a, b) => a + b, 0);
  const score = Math.round((total / (target.length + INSERTION_WEIGHT * insertions)) * 100);
  return { score: Math.min(100, Math.max(0, score)), wordResults };
}
