import { describe, expect, it } from "vitest";
import { jsonBytes, summarizeSizes } from "../../scripts/measure-cloud-docs.mjs";

// T3 in ACTION_PLAN.md: only aggregate numbers leave the script, never a
// uid or any content.
describe("summarizeSizes", () => {
  it("reports count, median, 90th percentile and max", () => {
    const sizes = [100, 900, 300, 200, 500, 400, 700, 600, 800, 1000];
    expect(summarizeSizes(sizes)).toEqual({ count: 10, median: 500, p90: 900, max: 1000 });
  });

  it("uses nearest rank (the lower middle for an even count) and handles one document", () => {
    expect(summarizeSizes([10, 20]).median).toBe(10);
    expect(summarizeSizes([42])).toEqual({ count: 1, median: 42, p90: 42, max: 42 });
  });

  it("handles an empty collection", () => {
    expect(summarizeSizes([])).toEqual({ count: 0, median: 0, p90: 0, max: 0 });
  });

  it("returns only numbers", () => {
    const summary = summarizeSizes([1, 2, 3]);
    expect(Object.values(summary).every((v) => typeof v === "number")).toBe(true);
  });
});

describe("jsonBytes", () => {
  it("counts UTF-8 bytes of the document as JSON", () => {
    expect(jsonBytes({ a: "ab" })).toBe(10);
    expect(jsonBytes({ a: "שלום" })).toBe(16);
  });
});
