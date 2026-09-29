import { describe, expect, it } from "vitest";
import * as selectors from "../../src/context/selectors";

const { independentSpeakingMs, repeatSpeakingMs } = selectors;

// T4 in ACTION_PLAN.md. The North Star (minutes of independent speaking a
// week) counts only turns the user said out loud. Records saved before T4
// have no source or duration: they're unknown, and count as 0.
describe("independentSpeakingMs", () => {
  it("adds up only spoken user turns", () => {
    const messages = [
      { role: "assistant", content: "Hi!" },
      { role: "user", content: "A coffee please", source: "spoken", durationMs: 2400 },
      { role: "user", content: "With milk", source: "typed" },
      { role: "user", content: "I would like a cake", source: "suggestion" },
      { role: "user", content: "Where is the toilet?", source: "translated" },
      { role: "user", content: "Thanks", source: "spoken", durationMs: 1100 },
    ];
    expect(independentSpeakingMs(messages)).toBe(3500);
  });

  it("counts turns saved before T4 as unknown, not as speaking", () => {
    expect(independentSpeakingMs([{ role: "user", content: "old turn" }])).toBe(0);
    expect(independentSpeakingMs([{ role: "user", content: "x", source: "spoken" }])).toBe(0);
    expect(independentSpeakingMs(undefined)).toBe(0);
  });

  it("ignores a duration that isn't a sane number", () => {
    const messages = [
      { role: "user", content: "a", source: "spoken", durationMs: -5 },
      { role: "user", content: "b", source: "spoken", durationMs: "3000" },
      { role: "user", content: "c", source: "spoken", durationMs: NaN },
    ];
    expect(independentSpeakingMs(messages)).toBe(0);
  });
});

describe("repeatSpeakingMs", () => {
  it("adds up the recorded time of practice attempts, skipping old ones", () => {
    const sentences = [
      { sentenceId: "s1", score: 80, durationMs: 1800 },
      { sentenceId: "s2", score: 60, kind: "speak" },
      { sentenceId: "s3", score: 90, durationMs: 2200 },
    ];
    expect(repeatSpeakingMs(sentences)).toBe(4000);
    expect(repeatSpeakingMs(undefined)).toBe(0);
  });
});

// CRITICAL_REVIEW.md §3 and ACTION_PLAN.md D1/D5: an active day has at least
// one act of speaking, and "days active" is computed, not a stored counter.
describe("isActiveDay", () => {
  const { isActiveDay } = selectors;

  it("counts a day with a sentence said out loud", () => {
    expect(isActiveDay({ sentences: [{ sentenceId: "s1", score: 40, wordResults: [] }] })).toBe(true);
    expect(isActiveDay({ sentences: [{ sentenceId: "s1", score: 40, kind: "speak" }] })).toBe(true);
  });

  it("counts a day with only a conversation the user took part in", () => {
    expect(isActiveDay({ sentences: [], chats: [{ chatId: "c1", turnCount: 3, ownTurnCount: 1 }] })).toBe(true);
    expect(isActiveDay({ chats: [{ chatId: "c1", turnCount: 2 }] })).toBe(true); // saved before ownTurnCount
  });

  it("doesn't count a conversation with no turn of the user's own, or none at all", () => {
    expect(isActiveDay({ chats: [{ chatId: "c1", turnCount: 4, ownTurnCount: 0 }] })).toBe(false);
    expect(isActiveDay({ chats: [{ chatId: "c1", turnCount: 0 }] })).toBe(false);
  });

  it("doesn't count sentence completion alone", () => {
    expect(isActiveDay({ sentences: [{ sentenceId: "s1", score: 100, kind: "cloze" }] })).toBe(false);
  });

  it("handles an empty or missing day", () => {
    expect(isActiveDay({})).toBe(false);
    expect(isActiveDay(undefined)).toBe(false);
  });
});

describe("selectDaysActive", () => {
  it("adds the archived days to the active days still kept", () => {
    const state = {
      archive: { daysActive: 4 },
      sessions: {
        "2026-09-20": { sentences: [{ sentenceId: "s1", score: 80, kind: "speak" }] },
        "2026-09-21": { chats: [{ chatId: "c1", turnCount: 2 }] },
        "2026-09-22": { chats: [{ chatId: "c2", turnCount: 0 }] },
      },
    };
    expect(selectors.selectDaysActive(state)).toBe(6);
    expect(selectors.selectDaysActive({ sessions: {} })).toBe(0);
  });
});

// §2א (and §19 later): the streak is computed from the active days.
describe("streakRun / selectStreak", () => {
  const spoke = { sentences: [{ sentenceId: "s", score: 80, kind: "speak" }] };
  const sessions = {
    "2026-09-20": spoke,
    "2026-09-22": spoke,
    "2026-09-23": { chats: [{ chatId: "c", turnCount: 2 }] },
    "2026-09-24": spoke,
    "2026-09-25": { sentences: [{ sentenceId: "s", score: 100, kind: "cloze" }] },
  };

  it("counts the run of active days ending at the last one", () => {
    expect(selectors.streakRun(sessions)).toEqual({ current: 3, lastPracticeDate: "2026-09-24" });
    expect(selectors.streakRun({})).toEqual({ current: 0, lastPracticeDate: null });
  });

  it("shows the run only while it's still alive (last active day today or yesterday)", () => {
    expect(selectors.selectStreak({ sessions }, "2026-09-25")).toBe(3);
    expect(selectors.selectStreak({ sessions }, "2026-09-24")).toBe(3);
    expect(selectors.selectStreak({ sessions }, "2026-09-26")).toBe(0);
  });
});

// CRITICAL_REVIEW.md §8: sentence-completion answers (100 or 0) stay out of
// the pronunciation numbers and get a count and average of their own.
describe("speaking and sentence-completion numbers", () => {
  const speak = (score) => ({ kind: "speak", score });
  const cloze = (score) => ({ kind: "cloze", score });
  const state = {
    sessions: {
      "2026-09-20": { sentences: [speak(80), cloze(100), speak(95)] },
      "2026-09-21": { sentences: [cloze(0), cloze(100), speak(91)] },
      "2026-09-22": { sentences: [cloze(100)] },
    },
    archive: { speakAbove90: 4 },
  };

  it("averages only spoken sentences", () => {
    expect(selectors.speakAverage(state.sessions["2026-09-20"].sentences)).toBe(88);
    expect(selectors.speakAverage(state.sessions["2026-09-22"].sentences)).toBeNull();
    expect(selectors.selectSpeakAverage(state)).toBe(89);
  });

  it("counts spoken sentences above 90, the archive included", () => {
    expect(selectors.selectSentencesAbove90(state)).toBe(6);
    expect(selectors.selectSentencesAbove90({ sessions: state.sessions })).toBe(2);
  });

  it("keeps a separate count and average for sentence completion", () => {
    expect(selectors.selectClozeStats(state)).toEqual({ answers: 4, correct: 3, average: 75 });
    expect(selectors.selectClozeStats({ sessions: {} })).toEqual({ answers: 0, correct: 0, average: null });
  });

  it("doesn't count a day with only sentence completion as active (D1)", () => {
    expect(selectors.isActiveDay(state.sessions["2026-09-22"])).toBe(false);
    expect(selectors.isActiveDay({ sentences: [{ score: 70, wordResults: [] }] })).toBe(true);
  });
});

// CRITICAL_REVIEW.md §19 and §28: the streak shown and today's progress are
// derived from the days, so they're right the morning after too.
describe("streak and today's progress (§19, §28)", () => {
  const spoke = { sentences: [{ sentenceId: "s", score: 80, kind: "speak" }] };
  const clozeOnly = { sentences: [{ sentenceId: "c", score: 100, kind: "cloze" }] };

  it("shows 0 after a 5-day gap, whatever the stored streak says", () => {
    const state = { sessions: { "2026-09-23": spoke, "2026-09-24": spoke }, streak: { current: 12 } };
    expect(selectors.selectStreak(state, "2026-09-29")).toBe(0);
  });

  it("doesn't let a day with only sentence completion keep the streak", () => {
    const sessions = { "2026-09-23": spoke, "2026-09-24": clozeOnly };
    expect(selectors.selectStreak({ sessions }, "2026-09-25")).toBe(0);
  });

  it("takes today's progress from today's day, so it resets at midnight", () => {
    const state = { sessions: { "2026-09-28": { sentences: [spoke.sentences[0], clozeOnly.sentences[0]] } } };
    expect(selectors.selectTodayProgress(state, "2026-09-28")).toHaveLength(2);
    expect(selectors.selectTodayProgress(state, "2026-09-29")).toEqual([]);
    expect(selectors.selectTodayProgress({}, "2026-09-29")).toEqual([]);
  });
});

// CRITICAL_REVIEW.md §16: only a conversation with 3 or more user turns is a
// finished one. A shorter one still makes the day active (D1).
describe("finished conversations (§16)", () => {
  const chat = (turnCount, extra = {}) => ({ chatId: `c${turnCount}`, turnCount, ownTurnCount: turnCount, ...extra });

  it("finishes a conversation at 3 user turns", () => {
    expect(selectors.isCompletedChat(chat(3))).toBe(true);
    expect(selectors.isCompletedChat(chat(2))).toBe(false);
    expect(selectors.isCompletedChat(chat(5, { status: "abandoned" }))).toBe(false);
    expect(selectors.isCompletedChat(chat(0))).toBe(false);
  });

  it("counts only finished conversations, the archive included", () => {
    const state = {
      sessions: { "2026-09-20": { chats: [chat(0), chat(1), chat(4)] }, "2026-09-21": { chats: [chat(3)] } },
      archive: { chats: 9, completedChats: 5 },
    };
    expect(selectors.selectTotalChats(state)).toBe(7);
    expect(selectors.selectTotalChats({ ...state, archive: { chats: 3 } })).toBe(5);
  });

  it("still makes the day active with one turn of the user's own", () => {
    expect(selectors.isActiveDay({ chats: [chat(1, { status: "abandoned" })] })).toBe(true);
  });
});

// CRITICAL_REVIEW.md §5 fix #4: the share of a conversation's user turns that
// came from a suggestion or a translation.
describe("helpedTurnShare", () => {
  it("counts suggestion and translated turns out of the user's turns", () => {
    const messages = [
      { role: "assistant", content: "Hi" },
      { role: "user", content: "a", source: "spoken" },
      { role: "user", content: "b", source: "suggestion" },
      { role: "user", content: "c", source: "translated" },
      { role: "user", content: "d" },
    ];
    expect(selectors.helpedTurnShare(messages)).toBe(0.5);
    expect(selectors.helpedTurnShare([])).toBe(0);
  });
});

// CRITICAL_REVIEW.md §14: only a conversation with 4 or more turns of the
// user's own (spoken or typed) says anything about their level.
describe("levelAdjustment", () => {
  const own = (n, source = "spoken") => Array.from({ length: n }, (_, i) => ({ role: "user", content: `t${i}`, source }));

  const rubric = (fluency, grammar, vocabulary) => ({ rubric: { fluency, grammar, vocabulary } });

  it("adjusts the level from a conversation with 4 turns of the user's own", () => {
    const messages = [...own(4), ...own(1, "suggestion")];
    expect(selectors.levelAdjustment(messages, rubric(4, 4, 4))).toEqual({ level: "B2", helpedShare: 0.2 });
  });

  it("doesn't adjust it from a shorter conversation or without a rubric", () => {
    expect(selectors.levelAdjustment([...own(3), ...own(3, "suggestion")], rubric(4, 4, 4))).toBeNull();
    expect(selectors.levelAdjustment(own(5), { overall_score: 90 })).toBeNull();
  });

  it("counts every user turn saved before T4 as the user's own", () => {
    expect(selectors.levelAdjustment(own(4, undefined), rubric(3, 3, 3))).toEqual({ level: "B1", helpedShare: 0 });
  });
});

// CRITICAL_REVIEW.md §14: the CEFR level a conversation's rubric shows, from
// the mean of its three parts.
describe("rubricLevel", () => {
  const level = (f, g, v) => selectors.rubricLevel({ fluency: f, grammar: g, vocabulary: v });

  it("maps the rubric's mean onto a level", () => {
    expect(level(1, 1, 1)).toBe("Pre-A1");
    expect(level(2, 1, 2)).toBe("A1");
    expect(level(2, 2, 2)).toBe("A1");
    expect(level(3, 2, 2)).toBe("A2");
    expect(level(3, 3, 2)).toBe("A2");
    expect(level(3, 3, 3)).toBe("B1");
    expect(level(4, 3, 3)).toBe("B1");
    expect(level(4, 4, 3)).toBe("B2");
    expect(level(4, 4, 4)).toBe("B2");
    expect(level(5, 5, 4)).toBe("C1");
    expect(level(5, 5, 5)).toBe("C1");
  });

  it("has no level without a full rubric", () => {
    expect(selectors.rubricLevel(undefined)).toBeUndefined();
    expect(selectors.rubricLevel({ fluency: 3, grammar: 3 })).toBeUndefined();
  });
});
