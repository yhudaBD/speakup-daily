import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { compareRubric, summarize } from "../../scripts/eval-conversation-rubric.mjs";

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

  it("passes at 85% of parts within 1 and nothing off by 3", () => {
    const close = (id) => ({ id, diff: { fluency: 0, grammar: 1, vocabulary: -1 } });
    expect(summarize([close("a"), close("b")])).toEqual({ agreement: 1, farOff: [], pass: true });

    const far = { id: "c", diff: { fluency: 3, grammar: 0, vocabulary: 0 } };
    expect(summarize([close("a"), far])).toMatchObject({ farOff: ["c"], pass: false });

    const off = (id) => ({ id, diff: { fluency: 2, grammar: 2, vocabulary: 0 } });
    expect(summarize([off("a"), off("b")]).pass).toBe(false);
  });
});
