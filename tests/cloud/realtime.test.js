// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { startRealtime } from "../../src/cloud/realtime";

// MIGRATION_PLAN.md §6: the profile and this month's document are listened
// to, and a change from the other device is merged in and becomes what this
// device knows the cloud holds.
function setup({ month = "2026-09" } = {}) {
  const listeners = new Map();
  const listen = vi.fn((path, onData) => {
    listeners.set(path, onData);
    return () => listeners.delete(path);
  });
  const sync = { setDoc: vi.fn() };
  const dispatch = vi.fn();
  let current = month;
  const stop = startRealtime({ sync, dispatch, bank: new Map(), listen, month: () => current });
  return { listeners, listen, sync, dispatch, stop, setMonth: (m) => { current = m; } };
}

afterEach(() => { document.dispatchEvent(new Event("visibilitychange")); });

describe("startRealtime", () => {
  it("listens to the profile and this month", () => {
    const { listeners } = setup();
    expect([...listeners.keys()]).toEqual(["profile/main", "months/2026-09"]);
  });

  it("merges a month from the other device and records it as the cloud's copy", () => {
    const { listeners, sync, dispatch } = setup();
    const month = { month: "2026-09", days: { "2026-09-29": { attempts: { a2: { id: "a2", itemId: "s1", score: 80, kind: "speak", ts: "t" } } } } };
    listeners.get("months/2026-09")(month);
    expect(sync.setDoc).toHaveBeenCalledWith("months/2026-09", month);
    const action = dispatch.mock.calls[0][0];
    expect(action.type).toBe("MERGE_CLOUD_DATA");
    expect(action.payload.sessions["2026-09-29"].sentences.map((s) => s.id)).toEqual(["a2"]);
  });

  it("merges the profile's settings and deletions", () => {
    const { listeners, dispatch } = setup();
    listeners.get("profile/main")({ settings: { dailyGoal: 10 }, wordBank: { apple: { deletedAt: "2026-09-29", updatedAt: "2026-09-29" } } });
    const { payload } = dispatch.mock.calls[0][0];
    expect(payload.settings).toEqual({ dailyGoal: 10 });
    expect(payload.deleted.words).toEqual({ apple: "2026-09-29" });
  });

  it("moves to the new month when the app comes back after midnight at the month's end", () => {
    const { listeners, setMonth } = setup();
    setMonth("2026-10");
    document.dispatchEvent(new Event("visibilitychange"));
    expect([...listeners.keys()]).toEqual(["profile/main", "months/2026-10"]);
  });

  it("stops listening", () => {
    const { listeners, stop } = setup();
    stop();
    expect(listeners.size).toBe(0);
  });
});
