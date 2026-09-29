import {
  isSpoken, selectDaysActive, selectSentencesAbove90, selectStreak, selectTotalChats,
} from "./selectors";

// XP and achievements, derived from the days (ACTION_PLAN.md D3 and D5,
// CRITICAL_REVIEW.md §20). XP rewards the effort of speaking, not the score:
// scoring XP teaches picking easy content.
export const XP = {
  spokenSentence: 10, // per sentence, not per attempt, whatever the score
  clozeAnswer: 2,
  ownTurn: 5, // spoken or typed by the user
  helpedTurn: 1, // from a suggestion or a translation
};
const XP_PER_LEVEL = 200;

// A spoken record scoring 0 had no recognized speech, and earns nothing.
function sentenceXp(sentence) {
  if (!isSpoken(sentence)) return XP.clozeAnswer;
  return sentence?.score > 0 ? XP.spokenSentence : 0;
}

// Records saved before ownTurnCount count every turn as the user's own, as
// they do for active days (selectors.js).
function chatXp(chat) {
  const turns = chat?.turnCount || 0;
  const own = typeof chat?.ownTurnCount === "number" ? Math.min(chat.ownTurnCount, turns) : turns;
  return own * XP.ownTurn + (turns - own) * XP.helpedTurn;
}

// XP earned on one day.
export function dayXp(day) {
  return (day?.sentences || []).reduce((sum, s) => sum + sentenceXp(s), 0)
    + (day?.chats || []).reduce((sum, c) => sum + chatXp(c), 0);
}

// XP ever: the archive of pruned days plus the days still kept. Archives
// folded before D3 have no XP.
export function selectXp(state) {
  const kept = Object.values(state?.sessions || {}).reduce((sum, day) => sum + dayXp(day), 0);
  return (state?.archive?.xp || 0) + kept;
}

export function selectLevel(state) {
  const xp = selectXp(state);
  return { xp, level: Math.floor(xp / XP_PER_LEVEL) + 1, xpIntoLevel: xp % XP_PER_LEVEL, xpPerLevel: XP_PER_LEVEL };
}

// Spoken sentences ever. Archives folded before §20 counted every sentence.
export function selectSpokenSentences(state) {
  const kept = Object.values(state?.sessions || {})
    .flatMap((d) => d?.sentences || [])
    .filter(isSpoken).length;
  const archive = state?.archive;
  return (archive ? archive.speakSentences ?? archive.sentences ?? 0 : 0) + kept;
}

// Whether each achievement is earned, by id: (state, today) => boolean.
export const ACHIEVEMENT_RULES = {
  "on-fire": (state, today) => selectStreak(state, today) >= 7,
  "perfect-day": (state, today) => {
    const spoken = (state?.sessions?.[today]?.sentences || []).filter(isSpoken);
    return spoken.length > 0 && spoken.every((s) => s.score === 100);
  },
  "sharp-tongue": (state) => selectSentencesAbove90(state) >= 10,
  "month-strong": (state) => (state?.streak?.longest || 0) >= 30,
  "getting-started": (state) => selectDaysActive(state) >= 1,
  consistent: (state) => selectDaysActive(state) >= 5,
  century: (state) => selectSpokenSentences(state) >= 100,
  chatterbox: (state) => selectTotalChats(state) >= 10,
  explorer: (state) => {
    const cats = new Set(
      Object.values(state?.sessions || {}).flatMap((s) => s?.sentences || []).map((x) => x.category).filter(Boolean),
    );
    return cats.size >= 5;
  },
  // Waits for §10, where words are saved only by choice.
  wordsmith: (state) => (state?.practice?.wordBank?.length || 0) >= 50,
  "night-owl": (state) =>
    Object.values(state?.sessions || {}).some((s) => s?.completedAt && new Date(s.completedAt).getHours() >= 22),
};
