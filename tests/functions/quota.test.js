import { describe, expect, it, vi } from "vitest";
import { consumeDailyQuota } from "../../netlify/functions/_shared/quota.js";

function memoryStore(initial = {}) {
  const data = { ...initial };
  return {
    data,
    get: vi.fn(async (key) => data[key] ?? null),
    setJSON: vi.fn(async (key, value) => { data[key] = value; }),
  };
}

const now = new Date("2026-09-24T10:00:00Z");

describe("consumeDailyQuota", () => {
  it("counts a call against today's key for that uid", async () => {
    const store = memoryStore();
    await (await consumeDailyQuota("uid-1", { store, now })).write;
    await (await consumeDailyQuota("uid-1", { store, now })).write;
    expect(store.data["2026-09-24/uid-1"]).toEqual({ count: 2 });
  });

  it("throws 429 once the limit is reached", async () => {
    const store = memoryStore({ "2026-09-24/uid-1": { count: 600 } });
    await expect(consumeDailyQuota("uid-1", { store, now })).rejects.toMatchObject({ status: 429 });
    expect(store.setJSON).not.toHaveBeenCalled();
  });

  it("starts fresh on a new day", async () => {
    const store = memoryStore({ "2026-09-23/uid-1": { count: 600 } });
    await (await consumeDailyQuota("uid-1", { store, now })).write;
    expect(store.data["2026-09-24/uid-1"]).toEqual({ count: 1 });
  });

  it("returns before the count write finishes, so the AI call can start (CRITICAL_REVIEW §34)", async () => {
    let finishWrite;
    const store = memoryStore();
    store.setJSON = vi.fn(() => new Promise((resolve) => { finishWrite = resolve; }));
    const outcome = await Promise.race([
      consumeDailyQuota("uid-1", { store, now }).then(() => "returned"),
      new Promise((resolve) => setTimeout(() => resolve("waited for the write"), 50)),
    ]);
    finishWrite();
    expect(outcome).toBe("returned");
  });

  it("fails open when storage is unavailable", async () => {
    const store = { get: vi.fn(async () => { throw new Error("MissingBlobsEnvironmentError"); }), setJSON: vi.fn() };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { write } = await consumeDailyQuota("uid-1", { store, now });
    await expect(write).resolves.toBeUndefined();
    expect(store.setJSON).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
