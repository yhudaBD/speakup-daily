import { describe, expect, it } from "vitest";
import { getWeakSentenceStats } from "../../src/utils/practiceHistory";

const attempt = (score) => ({ sentenceId: "s1", text: "I need water", score, kind: "speak" });

// CRITICAL_REVIEW.md §8: a sentence-completion answer isn't a pronunciation
// attempt, so it never makes a sentence weak.
describe("getWeakSentenceStats and sentence completion", () => {
  it("ignores sentence-completion answers", () => {
    const sessions = { "2026-09-20": { sentences: [{ sentenceId: "c1", text: "I ___ water", score: 0, kind: "cloze" }] } };
    expect(getWeakSentenceStats(sessions)).toEqual({});
  });
});

describe("getWeakSentenceStats", () => {
  it("flags a sentence that failed and was never passed", () => {
    const sessions = { "2026-09-20": { sentences: [attempt(40)] } };
    expect(getWeakSentenceStats(sessions)).toHaveProperty("s1");
  });
});

// CRITICAL_REVIEW.md §7: the list used to only grow. A sentence leaves it
// after two passes in a row, judged by the first try of each practice (§9).
describe("getWeakSentenceStats clears (§7)", () => {
  it("§7: a sentence passed twice after failing is no longer weak", () => {
    const sessions = {
      "2026-09-20": { sentences: [attempt(40)] },
      "2026-09-21": { sentences: [attempt(98)] },
      "2026-09-22": { sentences: [attempt(98)] },
    };
    expect(getWeakSentenceStats(sessions)).not.toHaveProperty("s1");
  });

  it("stays weak after one pass, and a new fail starts the count again", () => {
    const once = { "2026-09-20": { sentences: [attempt(40)] }, "2026-09-21": { sentences: [attempt(98)] } };
    expect(getWeakSentenceStats(once)).toHaveProperty("s1");

    const again = { ...once, "2026-09-22": { sentences: [attempt(50), attempt(90)] } };
    expect(getWeakSentenceStats(again)).toHaveProperty("s1");
  });

  it("judges by the first try, so reaching 92 on a retry doesn't hide a fail", () => {
    const sessions = { "2026-09-20": { sentences: [{ ...attempt(92), firstScore: 40, bestScore: 92, attempts: 4 }] } };
    expect(getWeakSentenceStats(sessions).s1).toMatchObject({ bestScore: 92, count: 1 });
  });

  it("orders the days by date, whatever order they were saved in", () => {
    const sessions = {
      "2026-09-22": { sentences: [attempt(40)] },
      "2026-09-20": { sentences: [attempt(98)] },
      "2026-09-21": { sentences: [attempt(98)] },
    };
    expect(getWeakSentenceStats(sessions)).toHaveProperty("s1");
  });

  it("counts every practice of the sentence and keeps its best score", () => {
    const sessions = { "2026-09-20": { sentences: [attempt(40), attempt(75)] } };
    expect(getWeakSentenceStats(sessions).s1).toMatchObject({ count: 2, bestScore: 75 });
  });
});
