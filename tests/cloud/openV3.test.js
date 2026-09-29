// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const loadV3 = vi.fn();
const writeOps = vi.fn(async () => {});
const loadCloudProfile = vi.fn();
vi.mock("../../src/cloud/v3Store", () => ({
  RECENT_CHATS: 20,
  loadV3: (...a) => loadV3(...a),
  writeOps: (...a) => writeOps(...a),
}));
vi.mock("../../src/services/firebase", () => ({ loadCloudProfile: (...a) => loadCloudProfile(...a) }));

const { openV3 } = await import("../../src/cloud/openV3");
const { migrateToV3 } = await import("../../src/cloud/schemaV3");
const { legacyFingerprint } = await import("../../src/cloud/migrationFlow");
const { initialState, reducer, snapshotForSync } = await import("../../src/context/appState");

// MIGRATION_PLAN.md §8: the first open after the update moves the account;
// later opens load the new structure, and merge the old document again if an
// app on an older version wrote to it.
const bank = new Map();
const speak = (id) => ({ id, sentenceId: "ai_1", text: "Hi", kind: "speak", score: 80, attempts: 1 });
const local = reducer(initialState, {
  type: "LOAD_DATA",
  payload: { ownerUid: "uid-a", sessions: { "2026-09-29": { sentences: [speak("local-1")] } } },
});
const legacyDoc = { schemaVersion: 2, ownerUid: "uid-a", sessions: { "2026-09-28": { sentences: [speak("cloud-1")] } } };

let dispatched;
const dispatch = (action) => dispatched.push(action);
const open = () => openV3({ uid: "uid-a", local, dispatch, bank, now: () => "T" });

beforeEach(() => {
  dispatched = [];
  loadV3.mockReset();
  writeOps.mockClear();
  loadCloudProfile.mockReset();
});

describe("openV3", () => {
  it("moves an account: merges the old document, writes everything, the profile last", async () => {
    loadV3.mockResolvedValue(null);
    loadCloudProfile.mockResolvedValue(legacyDoc);
    const sync = await open();

    expect(dispatched).toEqual([{ type: "MERGE_CLOUD_DATA", payload: legacyDoc }]);
    const ops = writeOps.mock.calls[0][1];
    expect(ops.at(-1).doc).toBe("profile/main");
    const written = JSON.stringify(ops);
    expect(written).toContain("local-1");
    expect(written).toContain("cloud-1");
    expect(written).toContain(legacyFingerprint(legacyDoc));
    sync.dispose();
  });

  it("moves an account with nothing in the cloud yet", async () => {
    loadV3.mockResolvedValue(null);
    loadCloudProfile.mockResolvedValue(null);
    const sync = await open();
    expect(dispatched).toEqual([]);
    expect(JSON.stringify(writeOps.mock.calls[0][1])).toContain("local-1");
    sync.dispose();
  });

  it("loads an account that moved, and writes nothing until something changes", async () => {
    const merged = reducer(local, { type: "MERGE_CLOUD_DATA", payload: legacyDoc });
    const docs = migrateToV3(snapshotForSync(merged), { bank });
    loadV3.mockResolvedValue({ ...docs, profile: { ...docs.profile, legacyFingerprint: legacyFingerprint(legacyDoc) } });
    loadCloudProfile.mockResolvedValue(legacyDoc);

    const sync = await open();
    expect(dispatched.map((a) => a.type)).toEqual(["MERGE_CLOUD_DATA"]);
    expect(writeOps).not.toHaveBeenCalled();
    sync.schedule(merged);
    await sync.flush();
    expect(writeOps).not.toHaveBeenCalled();
    sync.dispose();
  });

  it("merges the old document again when an older app wrote to it after the move", async () => {
    const docs = migrateToV3(snapshotForSync(local), { bank });
    loadV3.mockResolvedValue({ ...docs, profile: { ...docs.profile, legacyFingerprint: "before" } });
    loadCloudProfile.mockResolvedValue(legacyDoc);

    const sync = await open();
    expect(dispatched.map((a) => a.payload)).toContain(legacyDoc);
    const fingerprintWrite = writeOps.mock.calls.flatMap((c) => c[1]).find((o) => o.doc === "profile/main");
    expect(fingerprintWrite.fields).toContainEqual([["legacyFingerprint"], legacyFingerprint(legacyDoc)]);
    sync.dispose();
  });
  // ACTION_PLAN.md 7ג2.
  describe("with what this device kept from the last open", () => {
    const keptDocs = () => {
      const merged = reducer(local, { type: "MERGE_CLOUD_DATA", payload: legacyDoc });
      const docs = migrateToV3(snapshotForSync(merged), { bank });
      return { ...docs, profile: { ...docs.profile, legacyFingerprint: legacyFingerprint(legacyDoc) } };
    };
    const store = (kept) => {
      const saved = [];
      return { saved, read: () => kept, save: (b) => saved.push(structuredClone(b)) };
    };

    it("reads only what changed since, and keeps the rest from the device", async () => {
      const kept = { since: 1000, docs: keptDocs() };
      // The month another device wrote to comes back whole.
      const changedMonth = structuredClone(kept.docs.months["2026-09"]);
      changedMonth.days["2026-09-30"] = { attempts: { other: { id: "other", itemId: "ai_2", text: "Yo", kind: "speak", score: 90, ts: "T" } } };
      loadV3.mockResolvedValue({ profile: kept.docs.profile, months: { "2026-09": changedMonth }, chats: {}, syncedAt: 2000 });
      loadCloudProfile.mockResolvedValue(legacyDoc);
      const baselineStore = store(kept);

      const sync = await openV3({ uid: "uid-a", local, dispatch, bank, now: () => "T", baselineStore });
      expect(loadV3).toHaveBeenCalledWith("uid-a", { since: 1000 });
      const payload = dispatched[0].payload;
      expect(Object.keys(payload.sessions).sort()).toEqual(["2026-09-28", "2026-09-29", "2026-09-30"]);
      expect(payload.sessions["2026-09-30"].sentences[0].id).toBe("other");
      expect(baselineStore.saved.at(-1).since).toBe(2000);
      expect(baselineStore.saved.at(-1).docs.months["2026-09"]).toEqual(changedMonth);
      sync.dispose();
    });

    it("keeps what it wrote, for the next open", async () => {
      const kept = { since: 1000, docs: keptDocs() };
      loadV3.mockResolvedValue({ profile: kept.docs.profile, months: {}, chats: {}, syncedAt: 1000 });
      loadCloudProfile.mockResolvedValue(legacyDoc);
      const baselineStore = store(kept);
      const sync = await openV3({ uid: "uid-a", local, dispatch, bank, now: () => "T", baselineStore });
      const merged = reducer(reducer(local, { type: "MERGE_CLOUD_DATA", payload: legacyDoc }), { type: "UPDATE_SETTINGS", payload: { dailyGoal: 12 } });
      sync.schedule(merged);
      await sync.flush();
      expect(writeOps).toHaveBeenCalledTimes(1);
      expect(baselineStore.saved.at(-1).docs.profile.settings.dailyGoal).toBe(12);
      expect(baselineStore.saved.at(-1).since).toBe(1000);
      sync.dispose();
    });

    it("reads everything when nothing was kept, and keeps it", async () => {
      loadV3.mockResolvedValue({ ...keptDocs(), syncedAt: 3000 });
      loadCloudProfile.mockResolvedValue(legacyDoc);
      const baselineStore = store(null);
      const sync = await openV3({ uid: "uid-a", local, dispatch, bank, now: () => "T", baselineStore });
      expect(loadV3).toHaveBeenCalledWith("uid-a", { since: undefined });
      expect(baselineStore.saved.at(-1).since).toBe(3000);
      sync.dispose();
    });
  });
});
