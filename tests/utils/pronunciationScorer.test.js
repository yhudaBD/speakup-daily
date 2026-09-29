import { describe, expect, it } from "vitest";
import { scorePronunciation } from "../../src/utils/pronunciationScorer";

const score = (target, spoken) => scorePronunciation(target, spoken).score;
const statuses = (target, spoken) => scorePronunciation(target, spoken).wordResults.map((w) => w.status);

describe("scorePronunciation", () => {
  it("gives 100 to an exact repeat", () => {
    expect(score("I need water", "I need water")).toBe(100);
  });

  it("gives 0 to silence", () => {
    expect(score("I need water", "")).toBe(0);
    expect(score("I need water", undefined)).toBe(0);
  });

  it("ignores case, punctuation, curly apostrophes and hyphens", () => {
    expect(score("Where's the bus-stop?", "where’s the bus stop")).toBe(100);
  });

  it("gives partial credit to a close word and marks it partial", () => {
    const { score: s, wordResults } = scorePronunciation("I need water", "I need waiter");
    expect(s).toBeGreaterThan(80);
    expect(s).toBeLessThan(100);
    expect(wordResults.map((w) => w.status)).toEqual(["correct", "correct", "partial"]);
  });

  it("marks a missing word incorrect", () => {
    expect(statuses("I really need water", "I need water")).toEqual(["correct", "incorrect", "correct", "correct"]);
  });

  it("uses each spoken word once, in order", () => {
    expect(statuses("water water", "water").sort()).toEqual(["correct", "incorrect"]);
  });

  it("reports one result per word of the target, as written", () => {
    const { wordResults } = scorePronunciation("I don't know.", "I do not know");
    expect(wordResults.map((w) => w.word)).toEqual(["I", "don't", "know"]);
    expect(wordResults.every((w) => w.status === "correct")).toBe(true);
  });

  it("spells out numbers on both sides", () => {
    expect(score("I have 23 cats", "I have twenty three cats")).toBe(100);
    expect(score("Wait twenty-five minutes", "wait 25 minutes")).toBe(100);
  });
});

// CRITICAL_REVIEW.md §4, with the target values from ACTION_PLAN.md (T1).
describe("verified bugs (CRITICAL_REVIEW.md §4)", () => {
  it("§4: words in reverse order score at most 60", () => {
    expect(score("the cat ate the fish", "fish the ate cat the")).toBeLessThanOrEqual(60);
  });

  it("§4: extra words after the sentence score at most 80", () => {
    expect(score("I need water", "I need water and also pizza and a car please")).toBeLessThanOrEqual(80);
  });

  it("§4: 3 of 8 words score at most 45", () => {
    expect(score("I think that that is the the plan", "that the plan")).toBeLessThanOrEqual(45);
  });

  it("§4: a contraction of the target scores at least 95", () => {
    expect(score("I do not know", "I don't know")).toBeGreaterThanOrEqual(95);
  });

  it("§4: a digit for a spelled-out number scores at least 95", () => {
    expect(score("I'll be there in five minutes.", "I'll be there in 5 minutes")).toBeGreaterThanOrEqual(95);
  });
});
