import { describe, expect, it } from "vitest";
import { MONTH_DOC_LIMIT_BYTES, mapKey, migrateToV3, v3ToState } from "../../src/cloud/schemaV3";
import { initialState, reducer } from "../../src/context/appState";
import { selectDaysActive, selectSentencesAbove90, selectStreak, selectTotalChats } from "../../src/context/selectors";
import { selectXp } from "../../src/context/achievements";
import { getWeakSentenceStats } from "../../src/utils/practiceHistory";

// MIGRATION_PLAN.md §3 and §8: the single cloud document becomes a profile,
// a document per month and one per chat, and back, with nothing lost.
// The fixed sentence bank, by id: its text isn't stored in the cloud.
const bank = new Map([
  ["s1", { text: "I need water", translation: "אני צריך מים", category: "daily" }],
  ["s2", { text: "The traffic was terrible", translation: "הפקק", category: "daily" }],
]);
const words = (...pairs) => pairs.map(([word, status]) => ({ word, status, matchScore: status === "correct" ? 1 : 0.2 }));

const legacy = {
  schemaVersion: 2,
  ownerUid: "uid-a",
  user: { id: "user_1", name: "Dana", email: "d@example.com" },
  settings: { dailyGoal: 5, difficulty: "medium", chatDifficulty: "medium", difficultyManual: true },
  streak: { current: 2, longest: 9, lastPracticeDate: "2026-09-28" },
  sessions: {
    "2026-08-31": {
      sentences: [{ sentenceId: "s1", text: "I need water", translation: "אני צריך מים", category: "daily", kind: "speak", score: 92, attempts: 1, wordResults: words(["I", "correct"], ["need", "correct"], ["water", "correct"]) }],
      completedAt: "2026-08-31T20:00:00.000Z",
    },
    "2026-09-27": {
      sentences: [
        { sentenceId: "ai_001", text: "Where is gate 5?", translation: "איפה שער 5?", category: "ai", kind: "speak", score: 60, firstScore: 40, bestScore: 60, attempts: 3, durationMs: 5200, wordResults: words(["Where", "correct"], ["is", "correct"], ["gate", "incorrect"], ["5", "partial"]) },
        { sentenceId: "s2", text: "The traffic was terrible", translation: "הפקק", category: "daily", kind: "cloze", score: 0, attempts: 1 },
      ],
      chats: [{ chatId: "chat_1", topicId: "cafe", turnCount: 4, ownTurnCount: 3, status: "completed", helpUsedCount: 1, completedAt: "2026-09-27T10:00:00.000Z", feedback: { overall_score: 70, summary: "טוב" } }],
      completedAt: "2026-09-27T19:00:00.000Z",
    },
    "2026-09-28": {
      sentences: [{ sentenceId: "s1", text: "I need water", translation: "אני צריך מים", category: "daily", kind: "speak", score: 98, attempts: 1, wordResults: words(["I", "correct"], ["need", "correct"], ["water", "correct"]) }],
      completedAt: "2026-09-28T08:00:00.000Z",
    },
  },
  archive: { throughDate: "2025-09-01", daysActive: 12, sentences: 40, chats: 3, completedChats: 2, speakAbove90: 5, speakSentences: 30, xp: 400 },
  rolePlay: {
    chats: [{
      id: "chat_1", topicId: "cafe", topic: { id: "cafe", title: "Café", systemPrompt: "You are a barista." },
      messages: [{ role: "assistant", content: "Hi!" }, { role: "user", content: "A coffee", source: "spoken", durationMs: 1200 }],
      turnCount: 4, status: "completed", createdAt: "2026-09-27T09:50:00.000Z", updatedAt: "2026-09-27T10:05:00.000Z",
      feedback: { overall_score: 70, summary: "טוב" },
    }],
    customTopics: [{ id: "topic_1", title: "My job", systemPrompt: "You are my boss.", isCustom: true }],
  },
  practice: {
    wordBank: [
      { word: "schedule", meaning_he: "לוח זמנים", learnedAt: "2026-09-20T10:00:00.000Z" },
      { word: "e.g.", meaning_he: "למשל", learnedAt: "2026-09-21T10:00:00.000Z" },
    ],
    customTopics: [{ id: "ptopic_1", label: "Airport", sentences: [{ id: "ai_001", text: "Where is gate 5?" }] }],
  },
  lifetimeStats: { totalSentences: 44 },
  placement: { overall_level: "B1", gaps: ["past simple"] },
  baseline: { status: "recorded", at: "2026-09-20T10:00:00.000Z" },
};

const migrated = () => migrateToV3(legacy, { bank });
const loadedFrom = (data) => reducer(initialState, { type: "LOAD_DATA", payload: data });

function hasUndefined(value) {
  if (value === undefined) return true;
  if (value && typeof value === "object") return Object.values(value).some(hasUndefined);
  return false;
}

describe("migrateToV3", () => {
  it("builds a profile without the days, chats or stored counters", () => {
    const { profile } = migrated();
    expect(profile).toMatchObject({
      schemaVersion: 3,
      ownerUid: "uid-a",
      user: legacy.user,
      settings: legacy.settings,
      placement: legacy.placement,
      baseline: legacy.baseline,
      archive: legacy.archive,
      longestStreak: 9,
    });
    for (const gone of ["sessions", "rolePlay", "practice", "lifetimeStats", "streak"]) expect(profile).not.toHaveProperty(gone);
  });

  it("keeps the word bank and custom topics as maps with safe keys", () => {
    const { profile } = migrated();
    expect(Object.keys(profile.wordBank)).toEqual([mapKey("schedule"), mapKey("e.g.")]);
    expect(Object.keys(profile.wordBank).join("")).not.toMatch(/[./]/);
    expect(profile.wordBank[mapKey("schedule")]).toMatchObject({ word: "schedule", updatedAt: "2026-09-20T10:00:00.000Z" });
    expect(Object.values(profile.chatTopics).map((t) => t.id)).toEqual(["topic_1"]);
    expect(Object.values(profile.practiceTopics).map((t) => t.id)).toEqual(["ptopic_1"]);
  });

  it("puts each day in its month, with attempts as a map by id", () => {
    const { months } = migrated();
    expect(Object.keys(months).sort()).toEqual(["2026-08", "2026-09"]);
    const day = months["2026-09"].days["2026-09-27"];
    const attempts = Object.values(day.attempts).sort((a, b) => a.ts.localeCompare(b.ts));
    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toEqual({
      id: attempts[0].id, itemId: "ai_001", itemType: "sentence", kind: "speak",
      score: 60, firstScore: 40, bestScore: 60, attempts: 3, durationMs: 5200,
      missedWords: ["gate", "5"], ts: attempts[0].ts,
      text: "Where is gate 5?", translation: "איפה שער 5?", category: "ai",
    });
    expect(attempts[1]).not.toHaveProperty("text");
    expect(day.chats.chat_1).toMatchObject({ chatId: "chat_1", turnCount: 4, ownTurnCount: 3, status: "completed" });
    expect(day.chats.chat_1).not.toHaveProperty("feedback");
    expect(day.completedAt).toBe("2026-09-27T19:00:00.000Z");
  });

  it("keeps each full chat as its own document", () => {
    const { chats } = migrated();
    expect(Object.keys(chats)).toEqual(["chat_1"]);
    expect(chats.chat_1).toMatchObject({ id: "chat_1", messages: legacy.rolePlay.chats[0].messages, feedback: legacy.rolePlay.chats[0].feedback });
  });

  it("gives the same documents every time (idempotent)", () => {
    expect(migrated()).toEqual(migrated());
  });

  it("writes no undefined values, at any depth, which Firestore refuses", () => {
    expect(hasUndefined(migrated())).toBe(false);
    const chat = { ...legacy.rolePlay.chats[0], topic: { id: "t", emoji: undefined, title: "x" }, messages: [{ role: "user", content: "hi", he: undefined }] };
    expect(hasUndefined(migrateToV3({ ...legacy, rolePlay: { ...legacy.rolePlay, chats: [chat] } }, { bank }))).toBe(false);
  });

  it("keeps a heavy year's month documents far under the limit", () => {
    const sessions = {};
    for (let d = 1; d <= 31; d++) {
      const date = `2026-07-${String(d).padStart(2, "0")}`;
      sessions[date] = {
        sentences: Array.from({ length: 20 }, (_, i) => ({
          sentenceId: `ai_${i}`, text: "Could you tell me where the nearest pharmacy is, please?", translation: "תוכל להגיד לי איפה בית המרקחת הקרוב?",
          category: "ai", kind: "speak", score: 70, attempts: 2,
          wordResults: words(...Array.from({ length: 10 }, () => ["pharmacy", "partial"])),
        })),
        completedAt: `${date}T20:00:00.000Z`,
      };
    }
    const { months } = migrateToV3({ ...legacy, sessions }, { bank });
    const bytes = new TextEncoder().encode(JSON.stringify(months["2026-07"])).length;
    expect(bytes).toBeLessThan(MONTH_DOC_LIMIT_BYTES);
    expect(MONTH_DOC_LIMIT_BYTES).toBe(500 * 1024);
  });
});

describe("v3ToState", () => {
  const before = loadedFrom(legacy);
  const after = loadedFrom(v3ToState(migrated(), { bank }));

  it("gives back every day, sentence and chat, in order", () => {
    expect(Object.keys(after.sessions).sort()).toEqual(Object.keys(before.sessions).sort());
    for (const date of Object.keys(before.sessions)) {
      const strip = ({ wordResults: _w, missedWords: _m, id: _id, ...rest }) => rest;
      expect((after.sessions[date].sentences || []).map(strip)).toEqual((before.sessions[date].sentences || []).map(strip));
      expect(after.sessions[date].chats?.map((c) => c.chatId)).toEqual(before.sessions[date].chats?.map((c) => c.chatId));
    }
    expect(after.rolePlay.chats).toEqual(before.rolePlay.chats);
    expect(after.rolePlay.customTopics).toEqual(before.rolePlay.customTopics);
    expect(after.practice.customTopics).toEqual(before.practice.customTopics);
    expect(after.practice.wordBank.map((w) => w.word)).toEqual(before.practice.wordBank.map((w) => w.word));
  });

  it("gives back the profile and the longest streak", () => {
    for (const key of ["settings", "placement", "baseline", "archive", "user", "ownerUid"]) expect(after[key]).toEqual(before[key]);
    expect(after.streak.longest).toBe(9);
  });

  it("keeps the missed words in place of the full word scores", () => {
    expect(after.sessions["2026-09-27"].sentences[0].missedWords).toEqual(["gate", "5"]);
  });

  it("computes the same numbers the app shows", () => {
    const today = "2026-09-28";
    expect(selectDaysActive(after)).toBe(selectDaysActive(before));
    expect(selectStreak(after, today)).toBe(selectStreak(before, today));
    expect(selectXp(after)).toBe(selectXp(before));
    expect(selectSentencesAbove90(after)).toBe(selectSentencesAbove90(before));
    expect(selectTotalChats(after)).toBe(selectTotalChats(before));
    expect(Object.keys(getWeakSentenceStats(after.sessions))).toEqual(Object.keys(getWeakSentenceStats(before.sessions)));
  });

  it("leaves out items deleted on another device", () => {
    const docs = migrated();
    docs.profile.wordBank[mapKey("schedule")].deletedAt = "2026-09-29T10:00:00.000Z";
    docs.chats.chat_1.deletedAt = "2026-09-29T10:00:00.000Z";
    const state = v3ToState(docs, { bank });
    expect(state.practice.wordBank.map((w) => w.word)).toEqual(["e.g."]);
    expect(state.rolePlay.chats).toEqual([]);
  });
});

// Two devices practicing on the same day must not overwrite each other's
// attempts: a record made with an id keeps it, and the id survives the
// round trip; only records saved before ids get one from their position.
describe("attempt ids", () => {
  it("keeps a record's own id and gives it back", () => {
    const own = { ...legacy.sessions["2026-09-28"].sentences[0], id: "a-1234" };
    const docs = migrateToV3({ ...legacy, sessions: { "2026-09-28": { sentences: [own] } } }, { bank });
    expect(Object.keys(docs.months["2026-09"].days["2026-09-28"].attempts)).toEqual(["a-1234"]);
    expect(v3ToState(docs, { bank }).sessions["2026-09-28"].sentences[0].id).toBe("a-1234");
  });

  it("gives an older record the same position-based id every time", () => {
    const first = Object.keys(migrated().months["2026-09"].days["2026-09-28"].attempts);
    expect(first).toEqual(Object.keys(migrated().months["2026-09"].days["2026-09-28"].attempts));
    expect(first[0]).toMatch(/^2026-09-28_000_/);
  });
});
