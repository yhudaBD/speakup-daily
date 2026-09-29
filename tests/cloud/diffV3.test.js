import { describe, expect, it } from "vitest";
import { diffV3, nestFields } from "../../src/cloud/diffV3";
import { mapKey } from "../../src/cloud/schemaV3";

// MIGRATION_PLAN.md §5: only what changed is written, each change at its
// own key, so two devices merge instead of overwriting each other.
const NOW = "2026-09-29T12:00:00.000Z";
const attempt = (id, extra = {}) => ({ id, itemId: "s1", itemType: "sentence", kind: "speak", score: 80, ts: "2026-09-29T08:00:00.000Z", ...extra });

const base = () => ({
  profile: {
    schemaVersion: 3,
    settings: { dailyGoal: 5 },
    placement: { overall_level: "B1" },
    wordBank: { [mapKey("schedule")]: { word: "schedule", pos: 0, updatedAt: "2026-09-20" } },
    practiceTopics: {},
    chatTopics: {},
  },
  months: {
    "2026-09": { month: "2026-09", days: { "2026-09-29": { attempts: { a1: attempt("a1") }, chats: {}, completedAt: "2026-09-29T08:00:00.000Z" } } },
  },
  chats: { c1: { id: "c1", messages: [{ role: "user", content: "hi" }], updatedAt: "2026-09-29T09:00:00.000Z" } },
});
const diff = (prev, next) => diffV3(prev, next, { now: NOW });
const clone = (x) => structuredClone(x);

describe("diffV3", () => {
  it("writes nothing when nothing changed", () => {
    expect(diff(base(), base())).toEqual([]);
  });

  it("writes a new attempt at its own key in the month", () => {
    const next = clone(base());
    next.months["2026-09"].days["2026-09-29"].attempts.a2 = attempt("a2");
    next.months["2026-09"].days["2026-09-29"].completedAt = "2026-09-29T10:00:00.000Z";
    expect(diff(base(), next)).toEqual([{
      doc: "months/2026-09",
      fields: [
        [["days", "2026-09-29", "attempts", "a2"], attempt("a2")],
        [["days", "2026-09-29", "completedAt"], "2026-09-29T10:00:00.000Z"],
        [["updatedAt"], NOW],
      ],
    }]);
  });

  it("writes a whole new day, and a new month with its name", () => {
    const next = clone(base());
    next.months["2026-10"] = { month: "2026-10", days: { "2026-10-01": { attempts: { a9: attempt("a9") }, chats: {} } } };
    expect(diff(base(), next)).toEqual([{
      doc: "months/2026-10",
      fields: [
        [["month"], "2026-10"],
        [["days", "2026-10-01"], { attempts: { a9: attempt("a9") }, chats: {} }],
        [["updatedAt"], NOW],
      ],
    }]);
  });

  it("replaces a changed profile field whole, and writes a changed word at its key", () => {
    const next = clone(base());
    next.profile.settings = { dailyGoal: 10 };
    next.profile.wordBank[mapKey("schedule")].meaning_he = "לוח זמנים";
    expect(diff(base(), next)).toEqual([{
      doc: "profile/main",
      fields: [
        [["settings"], { dailyGoal: 10 }],
        [["wordBank", mapKey("schedule")], { word: "schedule", pos: 0, updatedAt: "2026-09-20", meaning_he: "לוח זמנים" }],
        [["updatedAt"], NOW],
      ],
    }]);
  });

  it("leaves a tombstone for a word removed on this device, so the other device doesn't bring it back", () => {
    const next = clone(base());
    delete next.profile.wordBank[mapKey("schedule")];
    expect(diff(base(), next)).toEqual([{
      doc: "profile/main",
      fields: [
        [["wordBank", mapKey("schedule")], { word: "schedule", pos: 0, updatedAt: NOW, deletedAt: NOW }],
        [["updatedAt"], NOW],
      ],
    }]);
  });

  it("writes a changed chat whole, and leaves a chat that only left this device's list", () => {
    const next = clone(base());
    next.chats.c1.messages.push({ role: "assistant", content: "Hello!" });
    next.chats.c2 = { id: "c2", messages: [], updatedAt: NOW };
    expect(diff(base(), next)).toEqual([
      { doc: "chats/c1", set: { ...next.chats.c1, updatedAt: NOW } },
      { doc: "chats/c2", set: { ...next.chats.c2, updatedAt: NOW } },
    ]);

    const dropped = clone(base());
    delete dropped.chats.c1;
    expect(diff(base(), dropped)).toEqual([]);
  });

  it("deletes a month whose days all went to the archive, and a single pruned day", () => {
    const withAugust = clone(base());
    withAugust.months["2025-08"] = { month: "2025-08", days: { "2025-08-30": { attempts: {} }, "2025-08-31": { attempts: {} } } };
    const next = clone(base());
    next.months["2025-08"] = { month: "2025-08", days: { "2025-08-31": { attempts: {} } } };
    expect(diff(withAugust, next)).toEqual([{
      doc: "months/2025-08",
      fields: [[["updatedAt"], NOW]],
      deleteFields: [["days", "2025-08-30"]],
    }]);
    expect(diff(withAugust, base())).toEqual([{ doc: "months/2025-08", delete: true }]);
  });

  it("doesn't write the times it adds itself as a change", () => {
    const prev = base();
    prev.months["2026-09"].updatedAt = "2026-09-28T00:00:00.000Z";
    prev.profile.updatedAt = "2026-09-28T00:00:00.000Z";
    expect(diff(prev, base())).toEqual([]);
  });
});

// v3Store.js writes each operation as one set() with mergeFields: it works
// on a document that doesn't exist yet, and touches only the listed fields.
describe("nestFields", () => {
  it("builds the nested data and the exact field paths to merge", () => {
    const { data, paths } = nestFields({
      doc: "months/2026-09",
      fields: [[["days", "2026-09-29", "attempts", "a2"], { score: 80 }], [["updatedAt"], NOW]],
      deleteFields: [["days", "2026-09-01"]],
    }, { deleteValue: "DELETE" });
    expect(data).toEqual({
      days: { "2026-09-29": { attempts: { a2: { score: 80 } } }, "2026-09-01": "DELETE" },
      updatedAt: NOW,
    });
    expect(paths).toEqual([["days", "2026-09-29", "attempts", "a2"], ["updatedAt"], ["days", "2026-09-01"]]);
  });
});
