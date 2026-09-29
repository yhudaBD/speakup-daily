import { beforeEach, describe, expect, it, vi } from "vitest";

// A stand-in for the Firestore SDK that records what a batch would do.
const batches = [];
let stored = {};
// Document data by path, for loadV3; syncedAt is a stand-in Timestamp.
let data = {};
const ts = (ms) => ({ toMillis: () => ms, ms });
const snapshots = {};
vi.mock("../../src/services/firebase", () => ({ db: { name: "db" } }));
vi.mock("firebase/firestore", () => ({
  FieldPath: class { constructor(...segments) { this.segments = segments; } },
  deleteField: () => "DELETE",
  serverTimestamp: () => "SERVER_TS",
  Timestamp: { fromMillis: (ms) => ts(ms) },
  getDoc: async (ref) => ({ exists: () => ref in data, data: () => data[ref] }),
  query: (path, ...parts) => ({ path, parts }),
  where: (field, op, value) => ({ where: [field, op, value] }),
  orderBy: () => ({}),
  limit: () => ({}),
  doc: (_db, ...path) => path.join("/"),
  collection: (_db, ...path) => path.join("/"),
  getDocs: async (q) => {
    const path = q.path ?? q;
    const after = q.parts?.find((p) => p.where)?.where[2].ms;
    const docs = (stored[path] || []).map((id) => ({ id, ref: `${path}/${id}`, data: () => data[`${path}/${id}`] }));
    return { docs: after === undefined ? docs : docs.filter((d) => d.data().syncedAt?.ms > after) };
  },
  onSnapshot: (ref, onNext) => {
    snapshots[ref] = onNext;
    return () => { delete snapshots[ref]; };
  },
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

const { BATCH_SIZE, deleteAllCloudData, listenDoc, loadV3, writeOps } = await import("../../src/cloud/v3Store");

beforeEach(() => { batches.length = 0; stored = {}; data = {}; });

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
        data: { days: { "2026-09-29": { attempts: { a2: { score: 80 } } }, "2025-09-01": "DELETE" }, updatedAt: "T", syncedAt: "SERVER_TS" },
        mergeFields: [["days", "2026-09-29", "attempts", "a2"], ["updatedAt"], ["syncedAt"], ["days", "2025-09-01"]],
      },
      { op: "set", ref: "users/uid-a/chats/c1", data: { id: "c1", messages: [], syncedAt: "SERVER_TS" }, mergeFields: undefined },
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

// MIGRATION_PLAN.md §6: the other device's changes, not this device's own
// writes on their way (hasPendingWrites), and not a document not made yet.
describe("listenDoc", () => {
  const snap = (data, { pending = false } = {}) => ({
    exists: () => data !== undefined,
    data: () => data,
    metadata: { hasPendingWrites: pending },
  });

  it("passes on the other device's changes only", () => {
    const onData = vi.fn();
    const stop = listenDoc("uid-a", "months/2026-09", onData);
    const push = snapshots["users/uid-a/months/2026-09"];
    push(snap({ days: {} }, { pending: true }));
    push(snap(undefined));
    push(snap({ days: { "2026-09-29": {} } }));
    expect(onData.mock.calls).toEqual([[{ days: { "2026-09-29": {} } }]]);
    stop();
    expect(snapshots["users/uid-a/months/2026-09"]).toBeUndefined();
  });
});

// ACTION_PLAN.md 7ג2: every write stamps the server's time (syncedAt), so
// an open reads only what was written after the last read, whatever the
// devices' clocks say.
describe("loadV3", () => {
  beforeEach(() => {
    data = {
      "users/uid-a/profile/main": { settings: {}, syncedAt: ts(300) },
      "users/uid-a/months/2026-08": { days: {}, syncedAt: ts(100) },
      "users/uid-a/months/2026-09": { days: {}, syncedAt: ts(500) },
      "users/uid-a/chats/c1": { id: "c1", syncedAt: ts(200) },
      "users/uid-a/chats/old": { id: "old" }, // written before syncedAt existed
    };
    stored = { "users/uid-a/months": ["2026-08", "2026-09"], "users/uid-a/chats": ["c1", "old"] };
  });

  it("reads everything, without the stamps, and gives the newest server time", async () => {
    const loaded = await loadV3("uid-a");
    expect(Object.keys(loaded.months)).toEqual(["2026-08", "2026-09"]);
    expect(Object.keys(loaded.chats)).toEqual(["c1", "old"]);
    expect(loaded.profile).toEqual({ settings: {} });
    expect(loaded.months["2026-09"]).toEqual({ days: {} });
    expect(loaded.syncedAt).toBe(500);
  });

  it("with since, reads the profile and only what was written after it", async () => {
    const loaded = await loadV3("uid-a", { since: 250 });
    expect(Object.keys(loaded.months)).toEqual(["2026-09"]);
    expect(loaded.chats).toEqual({});
    expect(loaded.syncedAt).toBe(500);
  });

  it("is null for an account that hasn't moved", async () => {
    data = {};
    expect(await loadV3("uid-a")).toBeNull();
  });
});
