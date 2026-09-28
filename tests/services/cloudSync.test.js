import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCloudSyncTracker, docSizeBytes, sizeRange } from "../../src/services/cloudSync";

// CRITICAL_REVIEW.md §1א: a failed or stuck cloud write is shown to the
// user, and a cloud document nearing Firestore's 1MB cap is reported.
const KB = 1024;

describe("docSizeBytes", () => {
  it("counts UTF-8 bytes of the JSON, so Hebrew counts double", () => {
    expect(docSizeBytes({ a: "ab" })).toBe('{"a":"ab"}'.length);
    expect(docSizeBytes({ a: "שלום" })).toBe('{"a":""}'.length + 8);
  });

  it("takes an already-serialized string as is", () => {
    expect(docSizeBytes('{"a":1}')).toBe(7);
  });
});

describe("sizeRange", () => {
  it("reports nothing below 700KB", () => {
    expect(sizeRange(699 * KB)).toBeNull();
  });

  it("reports only a coarse range above it", () => {
    expect(sizeRange(700 * KB)).toBe("700-800KB");
    expect(sizeRange(850 * KB)).toBe("800-900KB");
    expect(sizeRange(900 * KB)).toBe("900KB+");
    expect(sizeRange(2000 * KB)).toBe("900KB+");
  });
});

describe("createCloudSyncTracker", () => {
  let tracker;
  let changes;
  beforeEach(() => {
    vi.useFakeTimers();
    tracker = createCloudSyncTracker({ timeoutMs: 15_000 });
    changes = [];
    tracker.subscribe((localOnly) => changes.push(localOnly));
  });
  afterEach(() => vi.useRealTimers());

  const deferred = () => {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  };

  it("stays quiet when a write succeeds in time", async () => {
    await tracker.track(Promise.resolve());
    expect(tracker.isLocalOnly()).toBe(false);
    expect(changes).toEqual([]);
  });

  it("flags local-only when a write fails, and rethrows for the caller", async () => {
    await expect(tracker.track(Promise.reject(new Error("quota")))).rejects.toThrow("quota");
    expect(tracker.isLocalOnly()).toBe(true);
  });

  it("flags local-only when a write is still pending after the timeout (offline), and clears when it lands", async () => {
    const write = deferred();
    const tracked = tracker.track(write.promise);
    vi.advanceTimersByTime(14_999);
    expect(tracker.isLocalOnly()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(tracker.isLocalOnly()).toBe(true);

    write.resolve();
    await tracked;
    expect(tracker.isLocalOnly()).toBe(false);
    expect(changes).toEqual([true, false]);
  });

  it("clears after a failure once a later write succeeds", async () => {
    await tracker.track(Promise.reject(new Error("x"))).catch(() => {});
    await tracker.track(Promise.resolve());
    expect(tracker.isLocalOnly()).toBe(false);
  });

  it("ignores an older write that settles after a newer one", async () => {
    const older = deferred();
    const olderTracked = tracker.track(older.promise).catch(() => {});
    await tracker.track(Promise.resolve());
    older.reject(new Error("stale"));
    await olderTracked;
    vi.advanceTimersByTime(20_000);
    expect(tracker.isLocalOnly()).toBe(false);
  });
});
