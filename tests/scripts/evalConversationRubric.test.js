import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { compareRubric, levelSteps, summarize } from "../../scripts/eval-conversation-rubric.mjs";

const { examples } = JSON.parse(readFileSync(resolve("scripts/eval/conversation-rubric.json"), "utf8"));

// CRITICAL_REVIEW.md §14: examples with an expected rubric, to check the
// analysis prompt before and after each change.
describe("conversation rubric examples", () => {
  it("has about 20 examples, each with a full 1-5 rubric and turns of the student's own", () => {
    expect(examples.length).toBeGreaterThanOrEqual(20);
    expect(new Set(examples.map((e) => e.id)).size).toBe(examples.length);
    for (const e of examples) {
      for (const part of ["fluency", "grammar", "vocabulary"]) {
        expect(e.expected[part]).toBeGreaterThanOrEqual(1);
        expect(e.expected[part]).toBeLessThanOrEqual(5);
      }
      expect(e.messages.some((m) => m.role === "user" && m.source !== "suggestion" && m.source !== "translated")).toBe(true);
    }
  });

  it("covers every level and the marked help turns", () => {
    const totals = examples.map((e) => e.expected.fluency + e.expected.grammar + e.expected.vocabulary);
    expect(Math.min(...totals)).toBeLessThanOrEqual(4);
    expect(Math.max(...totals)).toBeGreaterThanOrEqual(14);
    const sources = new Set(examples.flatMap((e) => e.messages.map((m) => m.source)));
    expect(sources).toContain("suggestion");
    expect(sources).toContain("translated");
    expect(sources).toContain(undefined);
  });
});

describe("rubric agreement", () => {
  it("measures how far each part is from the expected one", () => {
    expect(compareRubric({ fluency: 3, grammar: 2, vocabulary: 4 }, { fluency: 4, grammar: 2, vocabulary: 1 }))
      .toEqual({ fluency: 1, grammar: 0, vocabulary: -3 });
  });

  const r = (f, g, v) => ({ fluency: f, grammar: g, vocabulary: v });
  const result = (id, expected, actual) => ({ id, expected, actual });

  it("passes when parts are close, unbiased and at the right level", () => {
    const close = (id) => result(id, r(3, 3, 3), r(3, 4, 2));
    expect(summarize([close("a"), close("b")])).toEqual({ agreement: 1, bias: 0, farOff: [], levelOff: [], pass: true });
  });

  it("fails a part off by 3 or too many parts off by 2", () => {
    expect(summarize([result("c", r(1, 3, 3), r(4, 3, 3))])).toMatchObject({ farOff: ["c"], pass: false });
    expect(summarize([result("a", r(1, 1, 3), r(3, 3, 3))]).pass).toBe(false);
  });

  it("fails a model that rates everyone in the middle", () => {
    const middle = [r(1, 1, 1), r(2, 2, 2), r(3, 3, 3), r(4, 4, 4), r(5, 5, 5)].map((e, i) => result(`e${i}`, e, r(3, 3, 3)));
    const high = [r(4, 4, 4), r(5, 5, 5), r(4, 5, 4)].map((e, i) => result(`h${i}`, e, r(e.fluency - 1, e.grammar - 1, e.vocabulary - 1)));
    const summary = summarize(high);
    expect(summary.agreement).toBe(1);
    expect(summary.bias).toBe(-1);
    expect(summary.pass).toBe(false);
    expect(summarize(middle).levelOff).toEqual(["e0", "e1", "e4"]);
  });

  it("counts level steps between two rubrics", () => {
    expect(levelSteps(r(4, 4, 4), r(3, 3, 3))).toBe(-1);
    expect(levelSteps(r(1, 1, 1), r(3, 3, 3))).toBe(3);
  });
});
