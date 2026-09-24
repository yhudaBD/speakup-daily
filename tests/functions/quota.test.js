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
    await consumeDailyQuota("uid-1", { store, now });
    await consumeDailyQuota("uid-1", { store, now });
    expect(store.data["2026-09-24/uid-1"]).toEqual({ count: 2 });
  });

  it("throws 429 once the limit is reached", async () => {
    const store = memoryStore({ "2026-09-24/uid-1": { count: 600 } });
    await expect(consumeDailyQuota("uid-1", { store, now })).rejects.toMatchObject({ status: 429 });
    expect(store.setJSON).not.toHaveBeenCalled();
  });

  it("starts fresh on a new day", async () => {
    const store = memoryStore({ "2026-09-23/uid-1": { count: 600 } });
    await expect(consumeDailyQuota("uid-1", { store, now })).resolves.toBeUndefined();
  });

  it("fails open when storage is unavailable", async () => {
    const store = { get: vi.fn(async () => { throw new Error("MissingBlobsEnvironmentError"); }), setJSON: vi.fn() };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(consumeDailyQuota("uid-1", { store, now })).resolves.toBeUndefined();
    warn.mockRestore();
  });
});
