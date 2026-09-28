import { describe, expect, it } from "vitest";
import { stripIdentity } from "../../scripts/strip-event-names.mjs";

// CRITICAL_REVIEW.md §41א: events stored before the fix still carry the
// user's name. The one-off script rewrites them without it.
describe("stripIdentity", () => {
  it("drops the name and email and keeps everything else", () => {
    const event = { userId: "u1", uid: "uid-1", userName: "Dana Levi", email: "d@example.com", type: "session_started", details: { a: 1 }, ts: "t" };
    expect(stripIdentity(event)).toEqual({ userId: "u1", uid: "uid-1", type: "session_started", details: { a: 1 }, ts: "t" });
    expect(event).toHaveProperty("userName"); // the input isn't mutated
  });

  it("returns null when there's nothing to remove, so the event isn't rewritten", () => {
    expect(stripIdentity({ userId: "u1", type: "session_started", details: {} })).toBeNull();
  });

  it("treats an empty stored name as something to remove", () => {
    expect(stripIdentity({ userId: "u1", userName: "", type: "session_started" })).toEqual({ userId: "u1", type: "session_started" });
  });
});
