import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialState, reducer, snapshotForSync } from "../../src/context/appState";
import { TOMBSTONE_DAYS, mergeDays } from "../../src/context/tombstones";

// MIGRATION_PLAN.md §6: a deletion is kept as a marker (deletedAt), so the
// other device knows the item was deleted and doesn't bring it back.
const loaded = (overrides = {}) => reducer(initialState, { type: "LOAD_DATA", payload: overrides });
const NOW = "2026-09-28T12:00:00.000Z";
const word = (w, learnedAt = "2026-09-20T08:00:00.000Z") => ({ id: `id_${w}`, word: w, meaning_he: "", learnedAt });
const chat = (id, updatedAt = "2026-09-20T09:00:00.000Z", extra = {}) => ({ id, topicId: "cafe", messages: [], updatedAt, ...extra });
const merge = (state, cloud) => reducer(state, { type: "MERGE_CLOUD_DATA", payload: cloud });

describe("deletion markers (§2ב)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
  });
  afterEach(() => vi.useRealTimers());

  it("starts empty and is saved with the rest", () => {
    expect(loaded().deleted).toEqual({ words: {}, chats: {}, chatTopics: {}, practiceTopics: {} });
    expect(snapshotForSync(loaded()).deleted).toEqual(loaded().deleted);
  });

  it("marks each kind of deletion with its time", () => {
    let state = loaded({
      practice: { wordBank: [word("Apple")], customTopics: [{ id: "pt1" }] },
      rolePlay: { chats: [chat("c1"), chat("c2", undefined, { topicId: "rt1" })], customTopics: [{ id: "rt1" }] },
    });
    state = reducer(state, { type: "REMOVE_WORD_FROM_BANK", payload: "id_Apple" });
    state = reducer(state, { type: "DELETE_ROLEPLAY_CHAT", payload: "c1" });
    state = reducer(state, { type: "DELETE_CUSTOM_TOPIC", payload: "rt1" });
    state = reducer(state, { type: "DELETE_CUSTOM_PRACTICE_TOPIC", payload: "pt1" });
    expect(state.deleted).toEqual({
      words: { apple: NOW },
      chats: { c1: NOW, c2: NOW },
      chatTopics: { rt1: NOW },
      practiceTopics: { pt1: NOW },
    });
  });

  it("a word deleted on this device isn't brought back by the other device's copy", () => {
    let state = loaded({ practice: { wordBank: [word("apple"), word("ticket")], customTopics: [] } });
    state = reducer(state, { type: "REMOVE_WORD_FROM_BANK", payload: "id_apple" });
    state = merge(state, { practice: { wordBank: [word("apple"), word("ticket")] } });
    expect(state.practice.wordBank.map((w) => w.word)).toEqual(["ticket"]);
  });

  it("a deletion from the other device removes the item here too", () => {
    const state = loaded({
      practice: { wordBank: [word("apple")], customTopics: [{ id: "pt1" }] },
      rolePlay: { chats: [chat("c1")], customTopics: [{ id: "rt1" }] },
    });
    const merged = merge(state, {
      deleted: { words: { apple: NOW }, chats: { c1: NOW }, chatTopics: { rt1: NOW }, practiceTopics: { pt1: NOW } },
    });
    expect(merged.practice.wordBank).toEqual([]);
    expect(merged.practice.customTopics).toEqual([]);
    expect(merged.rolePlay.chats).toEqual([]);
    expect(merged.rolePlay.customTopics).toEqual([]);
    expect(merged.deleted.words).toEqual({ apple: NOW });
  });

  it("keeps an item changed after it was deleted elsewhere", () => {
    const state = loaded({
      practice: { wordBank: [word("apple", "2026-09-28T13:00:00.000Z")], customTopics: [] },
      rolePlay: { chats: [chat("c1", "2026-09-28T13:00:00.000Z")], customTopics: [] },
    });
    const merged = merge(state, { deleted: { words: { apple: NOW }, chats: { c1: NOW } } });
    expect(merged.practice.wordBank).toHaveLength(1);
    expect(merged.rolePlay.chats).toHaveLength(1);
  });

  it("saving a deleted word again, or talking in a deleted chat again, clears its marker", () => {
    let state = loaded({ practice: { wordBank: [word("apple")], customTopics: [] }, rolePlay: { chats: [chat("c1")], customTopics: [] } });
    state = reducer(state, { type: "REMOVE_WORD_FROM_BANK", payload: "id_apple" });
    state = reducer(state, { type: "DELETE_ROLEPLAY_CHAT", payload: "c1" });
    state = reducer(state, { type: "ADD_PRACTICE_WORDS", payload: [word("Apple", "2026-01-01T00:00:00.000Z")] });
    state = reducer(state, { type: "UPSERT_ROLEPLAY_CHAT", payload: chat("c1") });
    expect(state.deleted.words).toEqual({});
    expect(state.deleted.chats).toEqual({});
    expect(state.practice.wordBank.map((w) => w.word)).toEqual(["Apple"]);
  });

  it("keeps the later of two markers, and drops markers older than 90 days", () => {
    const old = new Date(Date.parse(NOW) - (TOMBSTONE_DAYS + 1) * 86400000).toISOString();
    const state = loaded({ deleted: { words: { apple: "2026-09-01T00:00:00.000Z", pear: old } } });
    const merged = merge(state, { deleted: { words: { apple: "2026-09-10T00:00:00.000Z" } } });
    expect(merged.deleted.words).toEqual({ apple: "2026-09-10T00:00:00.000Z" });
  });
});

// Two devices practicing on the same day: each one's attempts are kept,
// instead of this device's day replacing the other's (MIGRATION_PLAN.md §6).
describe("mergeDays", () => {
  const s = (id, sentenceId = "s1") => ({ id, sentenceId, score: 80, kind: "speak" });

  it("unites the attempts and chats of a day by id", () => {
    const local = { "2026-09-28": { sentences: [s("a1")], chats: [{ chatId: "c1" }], completedAt: "2026-09-28T08:00:00Z" } };
    const cloud = { "2026-09-28": { sentences: [s("a1"), s("a2")], chats: [{ chatId: "c1" }, { chatId: "c2" }] }, "2026-09-27": { sentences: [s("a0")] } };
    expect(mergeDays(local, cloud)).toEqual({
      "2026-09-27": { sentences: [s("a0")] },
      "2026-09-28": { sentences: [s("a1"), s("a2")], chats: [{ chatId: "c1" }, { chatId: "c2" }], completedAt: "2026-09-28T08:00:00Z" },
    });
  });

  it("matches records saved before ids by the id the migration gave them", () => {
    const legacy = [{ sentenceId: "s1", score: 70 }, { sentenceId: "s2", score: 90 }];
    const migrated = [{ id: "2026-09-28_000_s1", sentenceId: "s1", score: 70 }, { id: "2026-09-28_001_s2", sentenceId: "s2", score: 90 }];
    const merged = mergeDays({ "2026-09-28": { sentences: legacy } }, { "2026-09-28": { sentences: migrated } });
    expect(merged["2026-09-28"].sentences).toEqual(legacy);
  });
});
