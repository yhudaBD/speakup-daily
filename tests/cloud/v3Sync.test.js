// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createV3Sync } from "../../src/cloud/v3Sync";

// MIGRATION_PLAN.md §5 and CRITICAL_REVIEW.md §27: writes wait 2 seconds and
// go together, go at once when the page is hidden or closed, one at a time,
// and a failed write is retried with the next.
const docsOf = (state) => ({ profile: { settings: state.settings }, months: {}, chats: {} });
const baseline = { profile: { settings: { dailyGoal: 5 } }, months: {}, chats: {} };

let write;
let sync;
beforeEach(() => {
  vi.useFakeTimers();
  write = vi.fn(async () => {});
  sync = createV3Sync({ uid: "uid-a", baseline, toDocs: docsOf, write, now: () => "T" });
});
afterEach(() => {
  sync.dispose();
  vi.useRealTimers();
});

describe("createV3Sync", () => {
  it("waits 2 seconds and writes the latest state once", async () => {
    sync.schedule({ settings: { dailyGoal: 6 } });
    await vi.advanceTimersByTimeAsync(1000);
    sync.schedule({ settings: { dailyGoal: 7 } });
    await vi.advanceTimersByTimeAsync(1999);
    expect(write).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][1]).toEqual([{ doc: "profile/main", fields: [[["settings"], { dailyGoal: 7 }], [["updatedAt"], "T"]] }]);
  });

  it("writes nothing when the state didn't change what's in the cloud", async () => {
    sync.schedule({ settings: { dailyGoal: 5 } });
    await vi.advanceTimersByTimeAsync(3000);
    expect(write).not.toHaveBeenCalled();
  });

  it("writes at once when the page is hidden or closed", async () => {
    sync.schedule({ settings: { dailyGoal: 6 } });
    window.dispatchEvent(new Event("pagehide"));
    await vi.advanceTimersByTimeAsync(0);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("writes only the new change after a successful write", async () => {
    sync.schedule({ settings: { dailyGoal: 6 } });
    await sync.flush();
    sync.schedule({ settings: { dailyGoal: 6 } });
    await sync.flush();
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("keeps a failed change and writes it again with the next", async () => {
    write.mockRejectedValueOnce(new Error("offline"));
    sync.schedule({ settings: { dailyGoal: 6 } });
    await expect(sync.flush()).rejects.toThrow("offline");
    sync.schedule({ settings: { dailyGoal: 6 } });
    await sync.flush();
    expect(write).toHaveBeenCalledTimes(2);
    expect(write.mock.calls[1][1][0].fields[0]).toEqual([["settings"], { dailyGoal: 6 }]);
  });

  it("runs one write at a time, the next against what the first wrote", async () => {
    let release;
    write.mockImplementationOnce(() => new Promise((r) => { release = r; }));
    sync.schedule({ settings: { dailyGoal: 6 } });
    const first = sync.flush();
    await vi.advanceTimersByTimeAsync(0); // the first write is under way
    sync.schedule({ settings: { dailyGoal: 7 } });
    const second = sync.flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(write).toHaveBeenCalledTimes(1);
    release();
    await first;
    await second;
    expect(write).toHaveBeenCalledTimes(2);
    expect(write.mock.calls[1][1][0].fields[0]).toEqual([["settings"], { dailyGoal: 7 }]);
  });

  it("reports each write, so a failed or stuck one shows the sync banner", async () => {
    const track = vi.fn((p) => p);
    const tracked = createV3Sync({ uid: "uid-a", baseline, toDocs: docsOf, write, track, now: () => "T" });
    tracked.schedule({ settings: { dailyGoal: 6 } });
    await tracked.flush();
    expect(track).toHaveBeenCalledTimes(1);
    tracked.dispose();
  });
  it("diffs against a document the other device changed (setDoc)", async () => {
    sync.setDoc("profile/main", { settings: { dailyGoal: 9 } });
    sync.schedule({ settings: { dailyGoal: 9 } });
    await vi.advanceTimersByTimeAsync(2000);
    expect(write).not.toHaveBeenCalled();
  });

  it("keeps a change from the other device that arrived during a write", async () => {
    let finish;
    write.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    sync.schedule({ settings: { dailyGoal: 6 } });
    await vi.advanceTimersByTimeAsync(2000);
    sync.setDoc("profile/main", { settings: { dailyGoal: 8 } });
    finish();
    await vi.advanceTimersByTimeAsync(0);
    sync.schedule({ settings: { dailyGoal: 8 } });
    await vi.advanceTimersByTimeAsync(2000);
    expect(write).toHaveBeenCalledTimes(1);
  });
});
