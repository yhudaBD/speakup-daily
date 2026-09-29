// The schema 3 writes against the Firestore emulator (MIGRATION_PLAN.md §5,
// §7, §8): the app's own writeOps, loadV3 and deleteAllCloudData, with
// Firestore's real mergeFields and deleteField, where tests/cloud/ only has
// a stand-in. Runs with `npm run test:rules` (CI's "rules" job).
import { readFileSync } from "node:fs";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, getDoc, getDocs, doc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { diffV3 } from "../src/cloud/diffV3";
import { migrationOps } from "../src/cloud/migrationFlow";
import { mapKey, migrateToV3, v3ToState } from "../src/cloud/schemaV3";

// v3Store.js takes its database from services/firebase.js: here, the
// emulator's, signed in as the account being written.
const holder = vi.hoisted(() => ({ db: null }));
vi.mock("../src/services/firebase", () => ({
  get db() { return holder.db; },
}));

let env;
let store;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-speakup-rules",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
  holder.db = env.authenticatedContext("alice").firestore();
  store = await import("../src/cloud/v3Store");
});
afterAll(() => env?.cleanup());
beforeEach(() => env.clearFirestore());

const bank = new Map([["s1", { text: "Hello there", translation: "שלום", category: "daily" }]]);
const NOW = "2026-09-29T12:00:00.000Z";
const legacy = {
  schemaVersion: 2,
  settings: { dailyGoal: 5 },
  sessions: {
    "2026-09-01": { sentences: [{ sentenceId: "s1", score: 60, kind: "speak" }] },
    "2026-09-28": { sentences: [{ id: "a-1", sentenceId: "s1", score: 95, kind: "speak" }], chats: [{ chatId: "c1", turnCount: 4 }] },
  },
  rolePlay: { chats: [{ id: "c1", topicId: "cafe", messages: [{ role: "user", content: "hi" }], updatedAt: "2026-09-28T09:00:00Z" }], customTopics: [] },
  practice: { wordBank: [{ word: "e.g.", meaning_he: "למשל", learnedAt: "2026-09-21T10:00:00Z" }], customTopics: [] },
};
const move = () => {
  const docs = migrateToV3(legacy, { bank });
  return { docs, ops: migrationOps(docs, { now: NOW, fingerprint: "f" }) };
};
const attemptIds = (state) => Object.values(state.sessions).flatMap((d) => d.sentences.map((s) => s.id)).sort();

describe("schema 3 in Firestore", () => {
  it("the move writes documents that load back as the same data", async () => {
    const { docs, ops } = move();
    await store.writeOps("alice", ops);
    const loaded = await store.loadV3("alice");
    const back = v3ToState(loaded, { bank });
    const expected = v3ToState(docs, { bank });
    expect(attemptIds(back)).toEqual(attemptIds(expected));
    expect(back.rolePlay.chats.map((c) => c.id)).toEqual(["c1"]);
    expect(back.practice.wordBank.map((w) => w.word)).toEqual(["e.g."]);
    expect(loaded.profile.legacyFingerprint).toBe("f");
  });

  it("two devices writing the same new day keep both attempts", async () => {
    const { docs, ops } = move();
    await store.writeOps("alice", ops);
    const addAttempt = (id) => {
      const next = structuredClone(docs);
      next.months["2026-09"].days["2026-09-29"] = { attempts: { [id]: { id, itemId: "s1", score: 80, kind: "speak", ts: NOW } }, chats: {} };
      return next;
    };
    // Both diff against the documents before either wrote the day.
    await store.writeOps("alice", diffV3(docs, addAttempt("phone"), { now: NOW }));
    await store.writeOps("alice", diffV3(docs, addAttempt("laptop"), { now: NOW }));
    const month = (await getDoc(doc(holder.db, "users", "alice", "months", "2026-09"))).data();
    expect(Object.keys(month.days["2026-09-29"].attempts).sort()).toEqual(["laptop", "phone"]);
    expect(Object.keys(month.days["2026-09-28"].attempts)).toEqual(["a-1"]);
  });

  it("removes a pruned day and an expired marker with deleteField, and writes a marker at a dotted key", async () => {
    const { docs, ops } = move();
    await store.writeOps("alice", ops);
    const next = structuredClone(docs);
    delete next.months["2026-09"].days["2026-09-01"];
    next.profile.wordBank[mapKey("e.g.")] = { deletedAt: NOW, updatedAt: NOW };
    await store.writeOps("alice", diffV3(docs, next, { now: NOW }));
    let loaded = await store.loadV3("alice");
    expect(Object.keys(loaded.months["2026-09"].days)).toEqual(["2026-09-28"]);
    expect(loaded.profile.wordBank[mapKey("e.g.")]).toEqual({ deletedAt: NOW, updatedAt: NOW });

    const pruned = structuredClone(next);
    delete pruned.profile.wordBank[mapKey("e.g.")];
    await store.writeOps("alice", diffV3(next, pruned, { now: NOW }));
    loaded = await store.loadV3("alice");
    expect(loaded.profile.wordBank).toEqual({});
  });

  it("deleting the account leaves no document under users/{uid}", async () => {
    await store.writeOps("alice", move().ops);
    await store.writeOps("alice", [{ doc: "srs/s1", set: { due: NOW } }]);
    const { setDoc } = await import("firebase/firestore");
    await setDoc(doc(holder.db, "users", "alice"), legacy);

    await store.deleteAllCloudData("alice");
    for (const name of store.SUBCOLLECTIONS) {
      expect((await getDocs(collection(holder.db, "users", "alice", name))).size).toBe(0);
    }
    expect((await getDoc(doc(holder.db, "users", "alice"))).exists()).toBe(false);
  });
  it("reads only what was written after the last read (ACTION_PLAN.md 7ג2)", async () => {
    const { docs, ops } = move();
    docs.months["2026-08"] = { month: "2026-08", days: { "2026-08-30": { attempts: { a0: { id: "a0", itemId: "s1", score: 70, kind: "speak", ts: NOW } } } } };
    await store.writeOps("alice", [...diffV3({}, { months: { "2026-08": docs.months["2026-08"] } }, { now: NOW }), ...ops]);
    const full = await store.loadV3("alice");
    expect(Object.keys(full.months).sort()).toEqual(["2026-08", "2026-09"]);
    expect(full.syncedAt).toBeGreaterThan(0);
    expect(full.profile.syncedAt).toBeUndefined();

    const next = structuredClone(docs);
    next.months["2026-09"].days["2026-09-30"] = { attempts: { b1: { id: "b1", itemId: "s1", score: 80, kind: "speak", ts: NOW } } };
    await store.writeOps("alice", diffV3(docs, next, { now: NOW }));
    const changed = await store.loadV3("alice", { since: full.syncedAt });
    expect(Object.keys(changed.months)).toEqual(["2026-09"]);
    expect(changed.chats).toEqual({});
    expect(changed.syncedAt).toBeGreaterThan(full.syncedAt);
  });
});
