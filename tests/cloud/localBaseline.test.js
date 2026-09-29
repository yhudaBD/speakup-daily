import { describe, expect, it } from "vitest";
import { clearBaseline, mergeChanged, readBaseline, saveBaseline } from "../../src/cloud/localBaseline";

// ACTION_PLAN.md 7ג2: a device that has synced keeps what the cloud holds
// and when it last read it (the server's time), so the next open reads only
// the profile and what changed since.
function memoryStorage() {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
}
const docs = { profile: { settings: { dailyGoal: 5 } }, months: { "2026-08": { days: {} }, "2026-09": { days: {} } }, chats: { c1: { id: "c1" } } };

describe("local baseline", () => {
  it("is kept per account", () => {
    const storage = memoryStorage();
    saveBaseline("uid-a", { since: 1000, docs }, storage);
    expect(readBaseline("uid-a", storage)).toEqual({ since: 1000, docs });
    expect(readBaseline("uid-b", storage)).toBeNull();
    clearBaseline("uid-a", storage);
    expect(readBaseline("uid-a", storage)).toBeNull();
  });

  it("reads nothing from damaged or blocked storage", () => {
    const storage = memoryStorage();
    storage.setItem("speakup_v3_baseline_uid-a", "{not json");
    expect(readBaseline("uid-a", storage)).toBeNull();
    storage.setItem("speakup_v3_baseline_uid-a", JSON.stringify({ docs }));
    expect(readBaseline("uid-a", storage)).toBeNull(); // no time, no use
    const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } };
    expect(readBaseline("uid-a", blocked)).toBeNull();
    expect(() => saveBaseline("uid-a", { since: 1, docs }, blocked)).not.toThrow();
    expect(() => clearBaseline("uid-a", blocked)).not.toThrow();
  });

  it("puts what changed over what was kept", () => {
    const changed = { profile: { settings: { dailyGoal: 9 } }, months: { "2026-09": { days: { "2026-09-29": {} } } }, chats: { c2: { id: "c2" } } };
    expect(mergeChanged(docs, changed)).toEqual({
      profile: { settings: { dailyGoal: 9 } },
      months: { "2026-08": { days: {} }, "2026-09": { days: { "2026-09-29": {} } } },
      chats: { c1: { id: "c1" }, c2: { id: "c2" } },
    });
  });
});
