import { beforeEach, describe, expect, it, vi } from "vitest";

// A stand-in for the Firestore SDK that records what a batch would do.
const batches = [];
let stored = {};
vi.mock("../../src/services/firebase", () => ({ db: { name: "db" } }));
vi.mock("firebase/firestore", () => ({
  FieldPath: class { constructor(...segments) { this.segments = segments; } },
  deleteField: () => "DELETE",
  doc: (_db, ...path) => path.join("/"),
  collection: (_db, ...path) => path.join("/"),
  getDocs: async (path) => ({ docs: (stored[path] || []).map((id) => ({ ref: `${path}/${id}` })) }),
  writeBatch: () => {
    const calls = [];
    batches.push(calls);
    return {
      set: (ref, data, options) => calls.push({ op: "set", ref, data, mergeFields: options?.mergeFields?.map((f) => f.segments) }),
      delete: (ref) => calls.push({ op: "delete", ref }),
      commit: async () => {},
    };
  },
}));

const { BATCH_SIZE, deleteAllCloudData, writeOps } = await import("../../src/cloud/v3Store");

beforeEach(() => { batches.length = 0; stored = {}; });

// MIGRATION_PLAN.md §5.
describe("writeOps", () => {
  it("writes fields with mergeFields, a whole chat as a set, and deletes a document", async () => {
    await writeOps("uid-a", [
      { doc: "months/2026-09", fields: [[["days", "2026-09-29", "attempts", "a2"], { score: 80 }], [["updatedAt"], "T"]], deleteFields: [["days", "2025-09-01"]] },
      { doc: "chats/c1", set: { id: "c1", messages: [] } },
      { doc: "months/2025-08", delete: true },
    ]);
    expect(batches).toEqual([[
      {
        op: "set", ref: "users/uid-a/months/2026-09",
        data: { days: { "2026-09-29": { attempts: { a2: { score: 80 } } }, "2025-09-01": "DELETE" }, updatedAt: "T" },
        mergeFields: [["days", "2026-09-29", "attempts", "a2"], ["updatedAt"], ["days", "2025-09-01"]],
      },
      { op: "set", ref: "users/uid-a/chats/c1", data: { id: "c1", messages: [] }, mergeFields: undefined },
      { op: "delete", ref: "users/uid-a/months/2025-08" },
    ]]);
  });

  it("splits more operations than a batch holds into several batches", async () => {
    const ops = Array.from({ length: BATCH_SIZE + 5 }, (_, i) => ({ doc: `chats/c${i}`, set: { id: `c${i}` } }));
    await writeOps("uid-a", ops);
    expect(batches.map((b) => b.length)).toEqual([BATCH_SIZE, 5]);
  });
});

// MIGRATION_PLAN.md §7: Firestore doesn't delete subcollections with their
// parent, so "delete account" lists and deletes every document.
describe("deleteAllCloudData", () => {
  it("deletes every month, chat, FSRS and profile document, and the old document", async () => {
    stored = {
      "users/uid-a/months": ["2026-08", "2026-09"],
      "users/uid-a/chats": ["c1"],
      "users/uid-a/profile": ["main"],
    };
    expect(await deleteAllCloudData("uid-a")).toBe(5);
    expect(batches.flat().map((c) => c.ref).sort()).toEqual([
      "users/uid-a", "users/uid-a/chats/c1", "users/uid-a/months/2026-08", "users/uid-a/months/2026-09", "users/uid-a/profile/main",
    ]);
    expect(batches.flat().every((c) => c.op === "delete")).toBe(true);
  });
});
