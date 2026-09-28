import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  freshStateFor,
  initialState,
  localDataOwnership,
  reducer,
  snapshotForSync,
} from "../../src/context/appState";

const loaded = (overrides = {}) => reducer(initialState, { type: "LOAD_DATA", payload: overrides });

describe("localDataOwnership", () => {
  it("treats data with no owner as unclaimed", () => {
    expect(localDataOwnership(null, "uid-b")).toBe("unclaimed");
    expect(localDataOwnership(undefined, "uid-b")).toBe("unclaimed");
  });

  it("recognizes the same account's data", () => {
    expect(localDataOwnership("uid-a", "uid-a")).toBe("own");
  });

  it("flags another account's data as foreign", () => {
    expect(localDataOwnership("uid-a", "uid-b")).toBe("foreign");
  });
});

describe("account isolation in the reducer", () => {
  const accountA = loaded({
    ownerUid: "uid-a",
    user: { id: "user_a", name: "Avi", email: "a@example.com" },
    sessions: { "2026-09-20": { sentences: [{ sentenceId: "s1", score: 80 }], averageScore: 80 } },
    lifetimeStats: { totalSentences: 1, sentencesAbove90: 0, daysActive: 1, totalChats: 0 },
    placement: { overall_level: "B1" },
  });

  it("keeps ownerUid through LOAD_DATA and into the sync snapshot", () => {
    expect(accountA.ownerUid).toBe("uid-a");
    expect(snapshotForSync(accountA).ownerUid).toBe("uid-a");
  });

  it("RESET_FOR_ACCOUNT replaces another account's data entirely", () => {
    const fresh = freshStateFor("uid-b", { name: "Bella", email: "b@example.com" });
    const next = reducer(accountA, { type: "RESET_FOR_ACCOUNT", payload: fresh });

    expect(next.ownerUid).toBe("uid-b");
    expect(next.user.name).toBe("Bella");
    expect(next.user.id).not.toBe("user_a");
    expect(next.sessions).toEqual({});
    expect(next.placement).toBeNull();
    expect(next.lifetimeStats.totalSentences).toBe(0);
    expect(next.isLoaded).toBe(true);
    expect(JSON.stringify(snapshotForSync(next))).not.toContain("Avi");
  });

  it("CLAIM_LOCAL_DATA assigns unclaimed data without touching it", () => {
    const legacy = loaded({ sessions: { "2026-09-20": { sentences: [], averageScore: 0 } } });
    const next = reducer(legacy, { type: "CLAIM_LOCAL_DATA", payload: { uid: "uid-a" } });
    expect(next.ownerUid).toBe("uid-a");
    expect(next.sessions).toBe(legacy.sessions);
  });

  it("MERGE_CLOUD_DATA keeps the local owner", () => {
    const next = reducer(accountA, { type: "MERGE_CLOUD_DATA", payload: { ownerUid: "something-else", sessions: {} } });
    expect(next.ownerUid).toBe("uid-a");
  });
});

describe("freshStateFor", () => {
  it("does not share mutable defaults between fresh states", () => {
    const a = freshStateFor("uid-a");
    const b = freshStateFor("uid-b");
    a.rolePlay.chats.push({ id: "x" });
    a.settings.dailyGoal = 10;
    expect(b.rolePlay.chats).toEqual([]);
    expect(b.settings.dailyGoal).toBe(initialState.settings.dailyGoal);
  });
});

// Verified bugs from CRITICAL_REVIEW.md. Each `it.fails` states the correct
// behavior and fails today; the fix turns it into a plain `it`. The plain
// test beside it keeps `it.fails` honest: a crash would also "fail".
describe("verified bugs (CRITICAL_REVIEW.md)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 28, 12, 0));
  });
  afterEach(() => vi.useRealTimers());

  const today = "2026-09-28";
  const chat = { chatId: "c1", topicId: "t1", turnCount: 4, helpUsedCount: 0, completedAt: "2026-09-28T09:00:00.000Z" };
  const sentence = { sentenceId: "s1", text: "I need water", score: 80 };

  it("§3 setup: a chat is saved under today's session", () => {
    const next = reducer(loaded(), { type: "SAVE_ROLEPLAY_SESSION", payload: chat });
    expect(next.sessions[today].chats).toHaveLength(1);
  });

  it.fails("§3: practicing a sentence after a chat keeps the day's chats", () => {
    const afterChat = reducer(loaded(), { type: "SAVE_ROLEPLAY_SESSION", payload: chat });
    const next = reducer(afterChat, { type: "SAVE_SESSION_RESULT", payload: sentence });
    expect(next.sessions[today].chats).toHaveLength(1);
  });

  const bankOf = (n) =>
    Array.from({ length: n }, (_, i) => ({ id: `w${i}`, word: `word${i}`, learnedAt: "2026-09-01T00:00:00.000Z" }));

  it("§11 setup: a new word is saved while the bank has room", () => {
    const state = loaded({ practice: { wordBank: bankOf(10) } });
    const next = reducer(state, { type: "ADD_PRACTICE_WORDS", payload: [{ word: "schedule" }] });
    expect(next.practice.wordBank.map((w) => w.word)).toContain("schedule");
  });

  it.fails("§11: a new word is saved when the bank already holds 100 words", () => {
    const state = loaded({ practice: { wordBank: bankOf(100) } });
    const next = reducer(state, { type: "ADD_PRACTICE_WORDS", payload: [{ word: "schedule" }] });
    expect(next.practice.wordBank.map((w) => w.word)).toContain("schedule");
  });
});
