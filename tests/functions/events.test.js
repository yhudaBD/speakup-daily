import { describe, expect, it } from "vitest";
import { sanitizeDetails } from "../../netlify/functions/_shared/events.js";

describe("sanitizeDetails", () => {
  it("keeps known fields of the right type", () => {
    expect(sanitizeDetails({
      kind: "roleplay", level: "B1", currentLevel: "B2", topicId: "cafe",
      topicTitle: "At the café", turnCount: 7, helpUsedCount: 2,
    })).toEqual({
      kind: "roleplay", level: "B1", currentLevel: "B2", topicId: "cafe",
      topicTitle: "At the café", turnCount: 7, helpUsedCount: 2,
    });
  });

  it("drops a script payload in a level field", () => {
    const out = sanitizeDetails({ level: "<img src=x onerror=alert(1)>", currentLevel: "<script>" });
    expect(out).toEqual({});
  });

  it("drops unknown fields, wrong types and absurd numbers", () => {
    expect(sanitizeDetails({ evil: "x", turnCount: "7", helpUsedCount: 1e9, kind: "hack" })).toEqual({});
  });

  it("truncates long strings", () => {
    expect(sanitizeDetails({ topicTitle: "a".repeat(500) }).topicTitle).toHaveLength(120);
  });

  it("handles missing or non-object details", () => {
    expect(sanitizeDetails(undefined)).toEqual({});
    expect(sanitizeDetails("x")).toEqual({});
  });

  it("keeps speaking time as whole seconds within a sane range (T4)", () => {
    expect(sanitizeDetails({ kind: "practice", independent_sec: 0, repeat_sec: 42.7 })).toEqual({
      kind: "practice", independent_sec: 0, repeat_sec: 42,
    });
    expect(sanitizeDetails({ independent_sec: -1, repeat_sec: 999999, kind: "other" })).toEqual({});
  });

  it("keeps a cloud document size only as one of the known ranges (CRITICAL_REVIEW §1א)", () => {
    expect(sanitizeDetails({ sizeRange: "800-900KB" })).toEqual({ sizeRange: "800-900KB" });
    expect(sanitizeDetails({ sizeRange: "812345" })).toEqual({});
  });
});
