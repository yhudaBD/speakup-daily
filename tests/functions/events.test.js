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
});
