import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { selectDaysActive } from "../../src/context/selectors";
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
    sessions: { "2026-09-20": { sentences: [{ sentenceId: "s1", score: 80, kind: "speak" }], averageScore: 80 } },
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

// T4 in ACTION_PLAN.md: how each user turn was made and how long each
// recording lasted are kept as given, and records from before T4 still load.
describe("speaking source and duration (T4)", () => {
  it("keeps source and durationMs on saved chat messages", () => {
    const chat = {
      id: "c1", topicId: "cafe",
      messages: [
        { role: "assistant", content: "Hi" },
        { role: "user", content: "A coffee", source: "spoken", durationMs: 2100 },
        { role: "user", content: "Milk", source: "typed" },
      ],
    };
    const next = reducer(loaded(), { type: "UPSERT_ROLEPLAY_CHAT", payload: chat });
    expect(next.rolePlay.chats[0].messages[1]).toEqual({ role: "user", content: "A coffee", source: "spoken", durationMs: 2100 });
    expect(next.rolePlay.chats[0].messages[2].source).toBe("typed");
  });

  it("keeps durationMs on a saved practice attempt", () => {
    const next = reducer(loaded(), { type: "SAVE_SESSION_RESULT", payload: { sentenceId: "s1", score: 80, durationMs: 1900 } });
    const [day] = Object.values(next.sessions);
    expect(day.sentences[0].durationMs).toBe(1900);
  });

  it("loads chats and attempts saved before T4 unchanged", () => {
    const old = loaded({
      rolePlay: { chats: [{ id: "c0", messages: [{ role: "user", content: "old" }] }], customTopics: [] },
      sessions: { "2026-09-01": { sentences: [{ sentenceId: "s1", score: 70, wordResults: [] }], averageScore: 70 } },
    });
    expect(old.rolePlay.chats[0].messages[0]).toEqual({ role: "user", content: "old" });
    expect(old.sessions["2026-09-01"].sentences[0]).toEqual({ sentenceId: "s1", score: 70, wordResults: [], kind: "speak" });
  });
});

// T5 in ACTION_PLAN.md: whether the user recorded "day 1" or chose not to.
// The recordings stay on the device; only this status is saved and synced.
describe("day-1 recording status (T5)", () => {
  it("starts unset, including for data saved before T5", () => {
    expect(loaded().baseline).toBeNull();
    expect(loaded({ sessions: {} }).baseline).toBeNull();
  });

  it("records the choice with a timestamp and saves it with the rest", () => {
    const next = reducer(loaded(), { type: "SET_BASELINE", payload: { status: "recorded" } });
    expect(next.baseline).toMatchObject({ status: "recorded" });
    expect(next.baseline.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(snapshotForSync(next).baseline).toEqual(next.baseline);
  });

  it("ignores an unknown status", () => {
    expect(reducer(loaded(), { type: "SET_BASELINE", payload: { status: "maybe" } }).baseline).toBeNull();
  });

  it("keeps the local choice when the cloud copy doesn't have one yet", () => {
    const local = reducer(loaded(), { type: "SET_BASELINE", payload: { status: "declined" } });
    const merged = reducer(local, { type: "MERGE_CLOUD_DATA", payload: { sessions: {} } });
    expect(merged.baseline.status).toBe("declined");
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
  const sentence = { sentenceId: "s1", text: "I need water", score: 80, kind: "speak" };

  it("§3 setup: a chat is saved under today's session", () => {
    const next = reducer(loaded(), { type: "SAVE_ROLEPLAY_SESSION", payload: chat });
    expect(next.sessions[today].chats).toHaveLength(1);
  });

  it("§3: practicing a sentence after a chat keeps the day's chats", () => {
    const afterChat = reducer(loaded(), { type: "SAVE_ROLEPLAY_SESSION", payload: chat });
    const next = reducer(afterChat, { type: "SAVE_SESSION_RESULT", payload: sentence });
    expect(next.sessions[today].chats).toHaveLength(1);
    expect(next.sessions[today].sentences).toHaveLength(1);
  });

  it("§3: a day that starts with a chat and goes on to a sentence is one active day", () => {
    const afterChat = reducer(loaded(), { type: "SAVE_ROLEPLAY_SESSION", payload: chat });
    expect(selectDaysActive(afterChat)).toBe(1);
    const next = reducer(afterChat, { type: "SAVE_SESSION_RESULT", payload: sentence });
    expect(selectDaysActive(next)).toBe(1);
  });

  it("§3: days active is no longer stored (D5)", () => {
    const before = loaded({ lifetimeStats: { totalSentences: 0, sentencesAbove90: 0, daysActive: 7, totalChats: 0 } });
    const next = reducer(before, { type: "SAVE_SESSION_RESULT", payload: sentence });
    expect(next.lifetimeStats.daysActive).toBe(7);
  });

  const bankOf = (n) =>
    Array.from({ length: n }, (_, i) => ({ id: `w${i}`, word: `word${i}`, learnedAt: "2026-09-01T00:00:00.000Z" }));

  it("§11 setup: a new word is saved while the bank has room", () => {
    const state = loaded({ practice: { wordBank: bankOf(10) } });
    const next = reducer(state, { type: "ADD_PRACTICE_WORDS", payload: [{ word: "schedule" }] });
    expect(next.practice.wordBank.map((w) => w.word)).toContain("schedule");
  });

  it("§11: a new word is saved when the bank already holds 100 words", () => {
    const state = loaded({ practice: { wordBank: bankOf(100) } });
    const next = reducer(state, { type: "ADD_PRACTICE_WORDS", payload: [{ word: "schedule" }] });
    expect(next.practice.wordBank.map((w) => w.word)).toContain("schedule");
    expect(next.practice.wordBank).toHaveLength(100);
  });

  it("§11: a full bank makes room by dropping the words saved longest ago", () => {
    const bank = bankOf(100).map((w, i) => ({ ...w, learnedAt: new Date(Date.UTC(2026, 0, 1 + i)).toISOString() }));
    const shuffled = [...bank.slice(50), ...bank.slice(0, 50)];
    const state = loaded({ practice: { wordBank: shuffled } });
    const next = reducer(state, { type: "ADD_PRACTICE_WORDS", payload: [{ word: "schedule" }, { word: "deadline" }] });
    const words = next.practice.wordBank.map((w) => w.word);
    expect(words).toHaveLength(100);
    expect(words).not.toContain("word0");
    expect(words).not.toContain("word1");
    expect(words).toContain("word2");
    expect(words).toContain("word99");
    expect(words.slice(-2)).toEqual(["schedule", "deadline"]);
  });

  it("§11: saving a word that's already there doesn't push anything out", () => {
    const state = loaded({ practice: { wordBank: bankOf(100) } });
    const next = reducer(state, { type: "ADD_PRACTICE_WORDS", payload: [{ word: "Word5" }] });
    expect(next.practice.wordBank).toHaveLength(100);
    expect(next.practice.wordBank.map((w) => w.word)).toContain("word0");
  });
});

// CRITICAL_REVIEW.md §3 / ACTION_PLAN.md D5: days pruned after a year are
// folded into an archive, so the totals don't drop, and days the cloud still
// holds (it never deletes, §1) aren't counted twice.
describe("archiving old days", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2027, 11, 1, 12, 0));
  });
  afterEach(() => vi.useRealTimers());

  const oldDays = {
    "2026-09-20": { sentences: [{ sentenceId: "s1", score: 80, kind: "speak" }, { sentenceId: "s2", score: 70, kind: "speak" }] },
    "2026-09-21": { chats: [{ chatId: "c1", turnCount: 3 }] },
    "2026-09-22": { sentences: [{ sentenceId: "s3", score: 100, kind: "cloze" }] },
  };
  const recent = { "2027-11-30": { sentences: [{ sentenceId: "s4", score: 90, kind: "speak" }] } };

  it("folds days older than a year into the archive on load, keeping the totals", () => {
    const state = loaded({ sessions: { ...oldDays, ...recent } });
    expect(Object.keys(state.sessions)).toEqual(["2027-11-30"]);
    expect(state.archive).toEqual({ throughDate: "2026-09-22", daysActive: 2, sentences: 3, chats: 1, completedChats: 1, speakAbove90: 0, speakSentences: 2, xp: 37 });
    expect(selectDaysActive(state)).toBe(3);
  });

  it("doesn't count archived days again when the cloud sends them back", () => {
    const state = loaded({ sessions: { ...oldDays, ...recent } });
    const merged = reducer(state, { type: "MERGE_CLOUD_DATA", payload: { sessions: { ...oldDays } } });
    expect(merged.sessions["2026-09-20"]).toBeUndefined();
    expect(selectDaysActive(merged)).toBe(3);
  });

  it("keeps the more complete archive when merging with the cloud copy", () => {
    const state = loaded({ sessions: { ...recent } });
    const cloudArchive = { throughDate: "2026-09-22", daysActive: 2, sentences: 3, chats: 1 };
    const merged = reducer(state, { type: "MERGE_CLOUD_DATA", payload: { sessions: {}, archive: cloudArchive } });
    expect(merged.archive).toEqual(cloudArchive);
  });

  it("saves the archive with the rest", () => {
    const state = loaded({ sessions: { ...oldDays } });
    expect(snapshotForSync(state).archive).toEqual(state.archive);
  });
});

// CRITICAL_REVIEW.md §2א: merging the cloud copy unites the two sides
// instead of letting the cloud overwrite whole fields.
describe("MERGE_CLOUD_DATA unites local and cloud (§2א)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 28, 12, 0));
  });
  afterEach(() => vi.useRealTimers());

  const word = (w, learnedAt) => ({ id: `id_${w}`, word: w, meaning_he: "", learnedAt });
  const chat = (id, updatedAt, extra = {}) => ({ id, topicId: "cafe", messages: [], updatedAt, ...extra });
  const merge = (local, cloud) => reducer(loaded(local), { type: "MERGE_CLOUD_DATA", payload: cloud });

  it("the train: words and a chat added offline survive a stale cloud copy", () => {
    const local = {
      practice: { wordBank: [word("apple", "2026-09-20T08:00:00Z"), word("ticket", "2026-09-28T07:00:00Z")], customTopics: [] },
      rolePlay: { chats: [chat("c_new", "2026-09-28T07:30:00Z"), chat("c_old", "2026-09-20T09:00:00Z")], customTopics: [] },
    };
    const staleCloud = {
      practice: { wordBank: [word("apple", "2026-09-20T08:00:00Z")], customTopics: [] },
      rolePlay: { chats: [chat("c_old", "2026-09-20T09:00:00Z")], customTopics: [] },
    };
    const merged = merge(local, staleCloud);
    expect(merged.practice.wordBank.map((w) => w.word).sort()).toEqual(["apple", "ticket"]);
    expect(merged.rolePlay.chats.map((c) => c.id)).toEqual(["c_new", "c_old"]);
  });

  it("two devices: each side's words, chats and custom topics are kept", () => {
    const local = {
      practice: { wordBank: [word("phone", "2026-09-27T08:00:00Z")], customTopics: [{ id: "pt_a", label: "A" }] },
      rolePlay: { chats: [chat("c_phone", "2026-09-27T09:00:00Z")], customTopics: [{ id: "rt_a", title: "A" }] },
    };
    const cloud = {
      practice: { wordBank: [word("laptop", "2026-09-26T08:00:00Z")], customTopics: [{ id: "pt_b", label: "B" }] },
      rolePlay: { chats: [chat("c_laptop", "2026-09-26T09:00:00Z")], customTopics: [{ id: "rt_b", title: "B" }] },
    };
    const merged = merge(local, cloud);
    expect(merged.practice.wordBank.map((w) => w.word).sort()).toEqual(["laptop", "phone"]);
    expect(merged.rolePlay.chats.map((c) => c.id)).toEqual(["c_phone", "c_laptop"]);
    expect(merged.practice.customTopics.map((t) => t.id).sort()).toEqual(["pt_a", "pt_b"]);
    expect(merged.rolePlay.customTopics.map((t) => t.id).sort()).toEqual(["rt_a", "rt_b"]);
  });

  it("on a conflict the newer copy wins: a word by learnedAt, a chat by updatedAt", () => {
    const local = {
      practice: { wordBank: [{ ...word("apple", "2026-09-20T08:00:00Z"), meaning_he: "old" }], customTopics: [] },
      rolePlay: { chats: [chat("c1", "2026-09-28T10:00:00Z", { turnCount: 6 })], customTopics: [] },
    };
    const cloud = {
      practice: { wordBank: [{ ...word("Apple", "2026-09-25T08:00:00Z"), meaning_he: "new" }], customTopics: [] },
      rolePlay: { chats: [chat("c1", "2026-09-27T10:00:00Z", { turnCount: 2 })], customTopics: [] },
    };
    const merged = merge(local, cloud);
    expect(merged.practice.wordBank).toHaveLength(1);
    expect(merged.practice.wordBank[0].meaning_he).toBe("new");
    expect(merged.rolePlay.chats[0].turnCount).toBe(6);
  });

  it("recomputes the streak from the merged days instead of copying the cloud's", () => {
    const spoke = { sentences: [{ sentenceId: "s", score: 80, kind: "speak" }] };
    const local = {
      sessions: { "2026-09-27": spoke, "2026-09-28": spoke },
      streak: { current: 2, longest: 2, lastPracticeDate: "2026-09-28" },
    };
    const cloud = {
      sessions: { "2026-09-26": spoke },
      streak: { current: 1, longest: 9, lastPracticeDate: "2026-09-26" },
    };
    const merged = merge(local, cloud);
    expect(merged.streak).toEqual({ current: 3, longest: 9, lastPracticeDate: "2026-09-28" });
  });

  it("keeps the larger of each stored counter until they become selectors (stage 5)", () => {
    const merged = merge(
      { lifetimeStats: { totalSentences: 12, sentencesAbove90: 1, totalChats: 4 } },
      { lifetimeStats: { totalSentences: 9, sentencesAbove90: 3, totalChats: 2 } },
    );
    expect(merged.lifetimeStats).toMatchObject({ totalSentences: 12, sentencesAbove90: 3, totalChats: 4 });
  });
});

// CRITICAL_REVIEW.md §19: the stored streak follows the active days (D1),
// so a sentence-completion answer alone doesn't start or keep one.
describe("streak on save (§19)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 28, 12, 0));
  });
  afterEach(() => vi.useRealTimers());

  it("starts with a spoken sentence and not with a sentence-completion answer", () => {
    const cloze = reducer(loaded(), { type: "SAVE_SESSION_RESULT", payload: { sentenceId: "c", score: 100, kind: "cloze" } });
    expect(cloze.streak.current).toBe(0);

    const spoken = reducer(cloze, { type: "SAVE_SESSION_RESULT", payload: { sentenceId: "s", score: 80, kind: "speak" } });
    expect(spoken.streak).toEqual({ current: 1, longest: 1, lastPracticeDate: "2026-09-28" });
  });

  it("continues yesterday's run and keeps the longest", () => {
    const state = loaded({
      sessions: { "2026-09-27": { sentences: [{ sentenceId: "s", score: 80, kind: "speak" }] } },
      streak: { current: 1, longest: 6, lastPracticeDate: "2026-09-27" },
    });
    const next = reducer(state, { type: "SAVE_ROLEPLAY_SESSION", payload: { chatId: "c", turnCount: 3, ownTurnCount: 3 } });
    expect(next.streak).toEqual({ current: 2, longest: 6, lastPracticeDate: "2026-09-28" });
  });
});

// CRITICAL_REVIEW.md §16: a plan step is done after 2 finished conversations.
describe("plan progress (§16)", () => {
  it("marks a step done after its second finished conversation", () => {
    const state = loaded({ placement: { overall_level: "B1" } });
    const once = reducer(state, { type: "UPDATE_PLAN_PROGRESS", payload: { moduleIndex: 0 } });
    expect(once.placement.planProgress[0]).toEqual({ sessionsCompleted: 1, status: "in_progress" });
    const twice = reducer(once, { type: "UPDATE_PLAN_PROGRESS", payload: { moduleIndex: 0 } });
    expect(twice.placement.planProgress[0]).toEqual({ sessionsCompleted: 2, status: "done" });
  });
});

// CRITICAL_REVIEW.md §5 fix #4: a conversation leaning on suggestions or
// translations (more than 30% of the turns) can't raise the level.
describe("ADJUST_LEVEL and help (§5)", () => {
  const b1 = loaded({ placement: { overall_level: "B1" } });
  const adjust = (state, level, helpedShare) => reducer(state, { type: "ADJUST_LEVEL", payload: { level, helpedShare } });

  it("raises the level after two conversations above it, of the user's own", () => {
    expect(adjust(adjust(b1, "B2", 0.2), "C1", 0).placement.overall_level).toBe("B2");
  });

  it("doesn't raise it when a strong conversation leaned on help", () => {
    expect(adjust(adjust(b1, "B2", 0.5), "B2", 0).placement.overall_level).toBe("B1");
    expect(adjust(adjust(b1, "B2", 0), "B2", 0.31).placement.overall_level).toBe("B1");
  });

  it("can still lower it", () => {
    expect(adjust(adjust(b1, "A2", 0.8), "A1", 0.8).placement.overall_level).toBe("A2");
  });
});

// CRITICAL_REVIEW.md §14: the level moves by comparing the level a
// conversation shows with the user's, not by an absolute score. An absolute
// score lowered an A2 learner for talking like an A2 learner.
describe("ADJUST_LEVEL compares with the user's level (§14)", () => {
  const at = (level) => loaded({ placement: { overall_level: level } });
  const adjust = (state, level) => reducer(state, { type: "ADJUST_LEVEL", payload: { level, helpedShare: 0 } });

  it("keeps a learner who talks at their level where they are", () => {
    const a2 = [1, 2, 3, 4].reduce((s) => adjust(s, "A2"), at("A2"));
    expect(a2.placement.overall_level).toBe("A2");
    const b2 = [1, 2, 3, 4].reduce((s) => adjust(s, "B2"), at("B2"));
    expect(b2.placement.overall_level).toBe("B2");
  });

  it("needs two in a row: a conversation at the level in between starts over", () => {
    expect(adjust(adjust(adjust(at("B1"), "B2"), "B1"), "B2").placement.overall_level).toBe("B1");
  });

  // The rubric examples (scripts/eval-conversation-rubric.mjs) read C1
  // speakers as B2 and Pre-A1 ones as A1 at times: at the ends of the scale,
  // one step says nothing.
  it("moves off the top or bottom level only on a conversation two steps away", () => {
    const c1 = [1, 2].reduce((s) => adjust(s, "B2"), at("C1"));
    expect(c1.placement.overall_level).toBe("C1");
    expect([1, 2].reduce((s) => adjust(s, "B1"), at("C1")).placement.overall_level).toBe("B2");

    const preA1 = [1, 2].reduce((s) => adjust(s, "A1"), at("Pre-A1"));
    expect(preA1.placement.overall_level).toBe("Pre-A1");
    expect([1, 2].reduce((s) => adjust(s, "A2"), at("Pre-A1")).placement.overall_level).toBe("A1");
  });

  it("ignores a conversation without a recognizable level", () => {
    const b1 = at("B1");
    expect(adjust(b1, undefined)).toBe(b1);
  });
});

// CRITICAL_REVIEW.md §13: the level sets the practice and conversation
// difficulty, unless the user chose them in Settings.
describe("level sets the difficulty (§13)", () => {
  const placed = (state, level) => reducer(state, { type: "SET_PLACEMENT_RESULT", payload: { overall_level: level } });

  it("sets both difficulties from the placement level", () => {
    const next = placed(loaded(), "B2");
    expect(next.settings).toMatchObject({ difficulty: "advanced", chatDifficulty: "hard" });
    expect(placed(loaded(), "A2").settings).toMatchObject({ difficulty: "medium", chatDifficulty: "easy" });
  });

  it("keeps difficulties the user chose", () => {
    const chose = reducer(loaded(), { type: "UPDATE_SETTINGS", payload: { chatDifficulty: "medium" } });
    expect(chose.settings.difficultyManual).toBe(true);
    expect(placed(chose, "B2").settings).toMatchObject({ difficulty: "easy", chatDifficulty: "medium" });
  });

  it("doesn't count other settings as choosing a difficulty", () => {
    const next = reducer(loaded(), { type: "UPDATE_SETTINGS", payload: { ttsSpeed: 0.8 } });
    expect(next.settings.difficultyManual).toBeFalsy();
  });

  it("follows the level when ADJUST_LEVEL moves it, and only then", () => {
    const b1 = placed(loaded(), "B1");
    const once = reducer(b1, { type: "ADJUST_LEVEL", payload: { level: "B2" } });
    expect(once.settings).toMatchObject({ difficulty: "medium", chatDifficulty: "medium" });
    const raised = reducer(once, { type: "ADJUST_LEVEL", payload: { level: "B2" } });
    expect(raised.placement.overall_level).toBe("B2");
    expect(raised.settings).toMatchObject({ difficulty: "advanced", chatDifficulty: "hard" });
  });

  it("leaves a manual choice alone when the level moves", () => {
    const chose = reducer(placed(loaded(), "B1"), { type: "UPDATE_SETTINGS", payload: { difficulty: "easy" } });
    const raised = ["B2", "B2"].reduce((s, level) => reducer(s, { type: "ADJUST_LEVEL", payload: { level } }), chose);
    expect(raised.settings.difficulty).toBe("easy");
  });
});

// CRITICAL_REVIEW.md §14: a level saved before toCefr existed ("A1 (usually
// the lower)", "C2") is normalized on load, so ADJUST_LEVEL recognizes it.
describe("saved placement level (§14)", () => {
  it("normalizes a saved level on load and from the cloud", () => {
    expect(loaded({ placement: { overall_level: "A1 (usually the lower)" } }).placement.overall_level).toBe("A1");
    expect(loaded({ placement: { overall_level: "C2" } }).placement.overall_level).toBe("C1");
    expect(loaded({ placement: { overall_level: "B1" } }).placement.overall_level).toBe("B1");
    expect(loaded({ placement: null }).placement).toBeNull();

    const merged = reducer(loaded(), { type: "MERGE_CLOUD_DATA", payload: { placement: { overall_level: "b2+" } } });
    expect(merged.placement.overall_level).toBe("B2");
  });
});
