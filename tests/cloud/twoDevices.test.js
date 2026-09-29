import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { diffV3 } from "../../src/cloud/diffV3";
import { migrateToV3, v3ToState } from "../../src/cloud/schemaV3";
import { initialState, reducer, snapshotForSync } from "../../src/context/appState";

// Two devices on one account, end to end through the pure parts: the state
// becomes documents (schemaV3), what changed is written (diffV3) to an
// in-memory cloud that applies the operations the way Firestore does, and
// the other device merges what it reads (MIGRATION_PLAN.md §5-§6).
const bank = new Map();
const toDocs = (state) => migrateToV3(snapshotForSync(state), { bank });

function applyOps(cloud, ops) {
  for (const op of ops) {
    const [collection, id] = op.doc.split("/");
    const key = collection === "profile" ? "profile" : collection;
    const read = () => (key === "profile" ? cloud.profile : cloud[key][id]);
    const put = (data) => { if (key === "profile") cloud.profile = data; else cloud[key][id] = data; };
    if (op.delete) { delete cloud[key][id]; continue; }
    if (op.set) { put(structuredClone(op.set)); continue; }
    const doc = structuredClone(read() || {});
    for (const [path, value] of op.fields || []) {
      let node = doc;
      path.slice(0, -1).forEach((s) => { node = node[s] ||= {}; });
      node[path.at(-1)] = structuredClone(value);
    }
    for (const path of op.deleteFields || []) {
      let node = doc;
      path.slice(0, -1).forEach((s) => { node = node?.[s]; });
      if (node) delete node[path.at(-1)];
    }
    put(doc);
  }
}

function device(cloud) {
  let state = reducer(initialState, { type: "LOAD_DATA", payload: {} });
  state = reducer(state, { type: "MERGE_CLOUD_DATA", payload: v3ToState(structuredClone(cloud), { bank }) });
  let written = structuredClone(cloud);
  return {
    get state() { return state; },
    act(action) { state = reducer(state, action); },
    push() {
      const next = toDocs(state);
      applyOps(cloud, diffV3(written, next, { now: new Date().toISOString() }));
      written = structuredClone(cloud);
    },
    pull() {
      written = structuredClone(cloud);
      state = reducer(state, { type: "MERGE_CLOUD_DATA", payload: v3ToState(structuredClone(cloud), { bank }) });
    },
  };
}

const word = (w) => ({ word: w, meaning_he: "", learnedAt: "2026-09-20T08:00:00.000Z" });

describe("two devices", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-29T12:00:00.000Z"));
  });
  afterEach(() => vi.useRealTimers());

  const start = () => {
    const seed = reducer(reducer(initialState, { type: "LOAD_DATA", payload: {} }), { type: "ADD_PRACTICE_WORDS", payload: [word("apple"), word("ticket")] });
    return structuredClone(toDocs(seed));
  };

  it("a word deleted on the phone stays deleted, though the laptop still had it", () => {
    const cloud = start();
    const phone = device(cloud);
    const laptop = device(cloud);

    const appleId = phone.state.practice.wordBank.find((w) => w.word === "apple").id;
    phone.act({ type: "REMOVE_WORD_FROM_BANK", payload: appleId });
    phone.push();

    laptop.act({ type: "ADD_PRACTICE_WORDS", payload: [word("gate")] });
    laptop.pull();
    laptop.push();
    phone.pull();

    for (const d of [phone, laptop]) expect(d.state.practice.wordBank.map((w) => w.word).sort()).toEqual(["gate", "ticket"]);
  });

  it("both devices' attempts on the same day are kept", () => {
    const cloud = start();
    const phone = device(cloud);
    const laptop = device(cloud);
    phone.act({ type: "SAVE_SESSION_RESULT", payload: { id: "a-phone", sentenceId: "s1", score: 80, kind: "speak" } });
    laptop.act({ type: "SAVE_SESSION_RESULT", payload: { id: "a-laptop", sentenceId: "s2", score: 70, kind: "speak" } });
    phone.push();
    laptop.push();
    phone.pull();
    laptop.pull();
    for (const d of [phone, laptop]) {
      expect(Object.values(d.state.sessions).flatMap((day) => day.sentences.map((s) => s.id)).sort()).toEqual(["a-laptop", "a-phone"]);
    }
  });

  it("a chat deleted on one device goes from the other, and its document from the cloud after 90 days", () => {
    const cloud = start();
    const phone = device(cloud);
    phone.act({ type: "UPSERT_ROLEPLAY_CHAT", payload: { id: "c1", topicId: "cafe", messages: [] } });
    phone.push();
    const laptop = device(cloud);
    expect(laptop.state.rolePlay.chats.map((c) => c.id)).toEqual(["c1"]);

    phone.act({ type: "DELETE_ROLEPLAY_CHAT", payload: "c1" });
    phone.push();
    laptop.pull();
    laptop.push();
    expect(laptop.state.rolePlay.chats).toEqual([]);
    expect(cloud.chats.c1.deletedAt).toBeTruthy();

    vi.setSystemTime(new Date("2027-01-15T12:00:00.000Z"));
    phone.pull();
    phone.push();
    expect(cloud.chats.c1).toBeUndefined();
  });
});
