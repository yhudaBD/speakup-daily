import { describe, expect, it } from "vitest";
import { scorePronunciation } from "../../src/utils/pronunciationScorer";

const score = (target, spoken) => scorePronunciation(target, spoken).score;

describe("scorePronunciation", () => {
  it("gives 100 to an exact repeat", () => {
    expect(score("I need water", "I need water")).toBe(100);
  });
});

// CRITICAL_REVIEW.md §4, with the target values from ACTION_PLAN.md (T1).
// Each `it.fails` states the correct behavior and fails today; the fix
// turns it into a plain `it`.
describe("verified bugs (CRITICAL_REVIEW.md)", () => {
  it.fails("§4: words in reverse order score at most 60", () => {
    expect(score("the cat ate the fish", "fish the ate cat the")).toBeLessThanOrEqual(60);
  });

  it.fails("§4: extra words after the sentence score at most 80", () => {
    expect(score("I need water", "I need water and also pizza and a car please")).toBeLessThanOrEqual(80);
  });

  it.fails("§4: 3 of 8 words score at most 45", () => {
    expect(score("I think that that is the the plan", "that the plan")).toBeLessThanOrEqual(45);
  });

  it.fails("§4: a contraction of the target scores at least 95", () => {
    expect(score("I do not know", "I don't know")).toBeGreaterThanOrEqual(95);
  });

  it.fails("§4: a digit for a spelled-out number scores at least 95", () => {
    expect(score("I'll be there in five minutes.", "I'll be there in 5 minutes")).toBeGreaterThanOrEqual(95);
  });
});
