import { describe, expect, it, vi } from "vitest";
import { importWithReload } from "../../src/utils/lazyPage";

// CRITICAL_REVIEW.md §39: pages load on demand. After a deploy the old
// chunks are gone, so a tab open from before fails to load a page: it
// reloads once to get the new version, and a second failure goes to the
// page's error boundary instead of reloading forever.
function memoryStorage() {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) };
}

describe("importWithReload", () => {
  it("returns the page, and clears an earlier reload mark", async () => {
    const storage = memoryStorage();
    storage.setItem("speakup_chunk_reload", "1");
    const page = { default: () => null };
    await expect(importWithReload(async () => page, { storage, reload: vi.fn() })).resolves.toBe(page);
    expect(storage.getItem("speakup_chunk_reload")).toBeNull();
  });

  it("reloads once when a page fails to load", async () => {
    const storage = memoryStorage();
    const reload = vi.fn();
    const pending = importWithReload(() => Promise.reject(new Error("Failed to fetch dynamically imported module")), { storage, reload });
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(storage.getItem("speakup_chunk_reload")).toBe("1");
    // It never settles: the page is reloading.
    const settled = await Promise.race([pending.then(() => true, () => true), new Promise((r) => setTimeout(() => r(false), 20))]);
    expect(settled).toBe(false);
  });

  it("lets a second failure reach the error boundary", async () => {
    const storage = memoryStorage();
    storage.setItem("speakup_chunk_reload", "1");
    const reload = vi.fn();
    await expect(importWithReload(() => Promise.reject(new Error("offline")), { storage, reload })).rejects.toThrow("offline");
    expect(reload).not.toHaveBeenCalled();
    expect(storage.getItem("speakup_chunk_reload")).toBeNull();
  });
});
