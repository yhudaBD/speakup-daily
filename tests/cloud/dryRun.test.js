import { describe, expect, it } from "vitest";
import { checkAccount, summarizeChecks } from "../../src/cloud/dryRun";

// MIGRATION_PLAN.md §8: the dry run moves every account in memory and
// checks each one, reporting numbers only.
const bank = new Map([["s1", { text: "Hello there", translation: "שלום", category: "daily" }]]);
const doc = {
  schemaVersion: 2,
  settings: { dailyGoal: 5 },
  streak: { current: 2, longest: 4, lastPracticeDate: "2026-09-28" },
  sessions: {
    "2026-09-27": { sentences: [{ sentenceId: "s1", score: 80, kind: "speak" }], completedAt: "2026-09-27T08:00:00Z" },
    "2026-09-28": {
      sentences: [{ sentenceId: "s1", score: 95, kind: "speak" }, { sentenceId: "ai_1", text: "Hi", score: 100, kind: "cloze" }],
      chats: [{ chatId: "c1", turnCount: 4, ownTurnCount: 4, completedAt: "2026-09-28T09:00:00Z" }],
    },
  },
  rolePlay: { chats: [{ id: "c1", topicId: "cafe", messages: [{ role: "user", content: "hi" }], updatedAt: "2026-09-28T09:00:00Z" }], customTopics: [] },
  practice: { wordBank: [{ word: "gate", meaning_he: "שער", learnedAt: "2026-09-28T09:00:00Z" }], customTopics: [] },
};

describe("checkAccount", () => {
  it("passes an account whose move keeps everything", () => {
    const result = checkAccount(doc, { bank, today: "2026-09-28" });
    expect(result.problems).toEqual([]);
    expect(result.counts).toEqual({ days: 2, attempts: 3, dayChats: 1, chats: 1, words: 1 });
    expect(result.docs).toBe(3); // the profile, one month, one chat
    expect(result.maxDocBytes).toBeGreaterThan(0);
  });

  it("reports a document over the limit", () => {
    const result = checkAccount(doc, { bank, today: "2026-09-28", limitBytes: 100 });
    expect(result.problems).toContain("doc_over_limit");
  });

  it("reports a record the move would lose", () => {
    const broken = structuredClone(doc);
    // A sentence without an id or a sentenceId can't get a stable id.
    broken.sessions["2026-09-28"].sentences.push({ sentenceId: "s1", score: 50, kind: "speak" });
    broken.sessions["2026-09-28"].sentences.push({ sentenceId: "s1", score: 50, kind: "speak", id: "2026-09-28_000_s1" });
    const result = checkAccount(broken, { bank, today: "2026-09-28" });
    expect(result.problems).toContain("attempts_lost");
  });
});

describe("summarizeChecks", () => {
  it("counts accounts and problems, and gives sizes, without any uid", () => {
    const ok = checkAccount(doc, { bank, today: "2026-09-28" });
    const big = checkAccount(doc, { bank, today: "2026-09-28", limitBytes: 100 });
    const summary = summarizeChecks([ok, big]);
    expect(summary).toMatchObject({ accounts: 2, passed: 1, failed: 1, problems: { doc_over_limit: 1 } });
    expect(Object.keys(summary)).toEqual(["accounts", "passed", "failed", "problems", "totals", "maxDocBytes"]);
  });
});
