import { describe, expect, it } from "vitest";
import { newAttemptId } from "../../src/utils/attemptId";

describe("newAttemptId", () => {
  it("is unique and safe as a Firestore map key", () => {
    const ids = new Set(Array.from({ length: 1000 }, newAttemptId));
    expect(ids.size).toBe(1000);
    for (const id of ids) expect(id).toMatch(/^[\w-]+$/);
  });
});
