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
});
