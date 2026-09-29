import { describe, expect, it } from "vitest";
import { ACHIEVEMENT_RULES, dayXp, selectLevel, selectXp } from "../../src/context/achievements";

const speak = (score, extra = {}) => ({ sentenceId: `s${score}`, score, kind: "speak", ...extra });
const cloze = (score) => ({ sentenceId: `c${score}`, score, kind: "cloze" });
const chat = (turnCount, ownTurnCount) => ({ chatId: "c", turnCount, ownTurnCount });
const today = "2026-09-28";

// D3 (ACTION_PLAN.md): XP for speaking effort, not score.
describe("XP (D3)", () => {
  it("gives 10 per spoken sentence whatever its score or attempts", () => {
    expect(dayXp({ sentences: [speak(40), speak(100, { attempts: 5 })] })).toBe(20);
  });

  it("gives nothing for a spoken attempt where no speech was recognized", () => {
    expect(dayXp({ sentences: [speak(0)] })).toBe(0);
  });

  it("gives 2 per sentence-completion answer, right or wrong", () => {
    expect(dayXp({ sentences: [cloze(100), cloze(0)] })).toBe(4);
  });

  it("gives 5 per turn of the user's own and 1 per suggested or translated turn", () => {
    expect(dayXp({ chats: [chat(4, 3)] })).toBe(16);
  });

  it("counts every turn of an old chat record without ownTurnCount as the user's own", () => {
    expect(dayXp({ chats: [{ chatId: "old", turnCount: 2 }] })).toBe(10);
  });

  it("adds the archive to the days still kept, and levels up every 200", () => {
    const state = { sessions: { [today]: { sentences: [speak(80)], chats: [chat(3, 3)] } }, archive: { xp: 400 } };
    expect(selectXp(state)).toBe(425);
    expect(selectLevel(state)).toEqual({ xp: 425, level: 3, xpIntoLevel: 25, xpPerLevel: 200 });
  });
});

// CRITICAL_REVIEW.md §20: achievements are derived from the days and need
// real speaking.
describe("achievements (§20)", () => {
  const earned = (id, state) => ACHIEVEMENT_RULES[id](state, today);

  it("Perfect Day needs spoken sentences, all at 100", () => {
    expect(earned("perfect-day", { sessions: { [today]: { chats: [chat(3, 3)] } } })).toBe(false);
    expect(earned("perfect-day", { sessions: { [today]: { sentences: [cloze(100), cloze(100)] } } })).toBe(false);
    expect(earned("perfect-day", { sessions: { [today]: { sentences: [speak(100), cloze(0)] } } })).toBe(true);
    expect(earned("perfect-day", { sessions: { [today]: { sentences: [speak(100), speak(95)] } } })).toBe(false);
  });

  it("Sharp Tongue counts spoken sentences above 90 only", () => {
    const tenCloze = Array.from({ length: 10 }, () => cloze(100));
    expect(earned("sharp-tongue", { sessions: { [today]: { sentences: tenCloze } } })).toBe(false);
    const tenSpoken = Array.from({ length: 10 }, (_, i) => speak(90 + i));
    expect(earned("sharp-tongue", { sessions: { [today]: { sentences: tenSpoken } } })).toBe(true);
  });

  it("On Fire follows the streak shown, so an ended run doesn't keep it", () => {
    const week = Object.fromEntries(
      ["2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20", "2026-09-21"]
        .map((d) => [d, { sentences: [speak(80)] }]),
    );
    expect(ACHIEVEMENT_RULES["on-fire"]({ sessions: week }, "2026-09-22")).toBe(true);
    expect(ACHIEVEMENT_RULES["on-fire"]({ sessions: week }, "2026-09-28")).toBe(false);
  });

  it("Chatterbox counts finished conversations only", () => {
    const chats = Array.from({ length: 10 }, () => chat(2, 2));
    expect(earned("chatterbox", { sessions: { [today]: { chats } } })).toBe(false);
  });

  it("Century Club counts spoken sentences, the archive included", () => {
    expect(earned("century", { sessions: { [today]: { sentences: [speak(80)] } }, archive: { speakSentences: 99 } })).toBe(true);
    expect(earned("century", { sessions: { [today]: { sentences: [cloze(100)] } }, archive: { speakSentences: 99 } })).toBe(false);
  });

  it("First Step and Consistent need active days (D1)", () => {
    expect(earned("getting-started", { sessions: { [today]: { sentences: [cloze(100)] } } })).toBe(false);
    expect(earned("getting-started", { sessions: { [today]: { sentences: [speak(50)] } } })).toBe(true);
  });
});
