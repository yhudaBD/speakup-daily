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

// CRITICAL_REVIEW.md §7. The `it.fails` states the correct behavior and
// fails today; the fix turns it into a plain `it`.
describe("verified bugs (CRITICAL_REVIEW.md)", () => {
  it.fails("§7: a sentence passed twice after failing is no longer weak", () => {
    const sessions = {
      "2026-09-20": { sentences: [attempt(40)] },
      "2026-09-21": { sentences: [attempt(98)] },
      "2026-09-22": { sentences: [attempt(98)] },
    };
    expect(getWeakSentenceStats(sessions)).not.toHaveProperty("s1");
  });
});
