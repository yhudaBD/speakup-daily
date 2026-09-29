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
      { sentenceId: "s2", score: 60 },
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
    expect(isActiveDay({ sentences: [{ sentenceId: "s1", score: 40 }] })).toBe(true);
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
        "2026-09-20": { sentences: [{ sentenceId: "s1", score: 80 }] },
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
  const spoke = { sentences: [{ sentenceId: "s", score: 80 }] };
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
