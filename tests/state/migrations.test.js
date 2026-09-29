import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION, initialState, reducer, snapshotForSync } from "../../src/context/appState";
import { migrateSessions, sentenceKind } from "../../src/context/migrations";

// CRITICAL_REVIEW.md §8. Records saved before `kind` existed are classified
// by the rule the user approved: a spoken attempt always saved wordResults,
// a sentence-completion answer never did.
const spokenOld = { sentenceId: "s1", score: 80, attempts: 1, wordResults: [{ word: "hi", status: "correct" }] };
const clozeOld = { sentenceId: "c1", score: 100, attempts: 1, text: "I ___ water" };

describe("sentenceKind", () => {
  it("keeps a record's own kind", () => {
    expect(sentenceKind({ kind: "cloze", wordResults: [] })).toBe("cloze");
    expect(sentenceKind({ kind: "speak" })).toBe("speak");
  });

  it("classifies an old record by whether it has wordResults", () => {
    expect(sentenceKind(spokenOld)).toBe("speak");
    expect(sentenceKind({ ...spokenOld, wordResults: [] })).toBe("speak");
    expect(sentenceKind(clozeOld)).toBe("cloze");
  });
});

describe("migrateSessions (schema 1 → 2)", () => {
  const v1 = { "2026-09-20": { sentences: [spokenOld, clozeOld], chats: [{ id: "c" }] } };

  it("gives every old record its kind and leaves the rest of the day alone", () => {
    const migrated = migrateSessions(v1, 1);
    expect(migrated["2026-09-20"].sentences.map((s) => s.kind)).toEqual(["speak", "cloze"]);
    expect(migrated["2026-09-20"].sentences[0]).toMatchObject(spokenOld);
    expect(migrated["2026-09-20"].chats).toEqual([{ id: "c" }]);
  });

  it("treats data with no version as the oldest", () => {
    expect(migrateSessions(v1, undefined)["2026-09-20"].sentences[1].kind).toBe("cloze");
  });

  it("returns current data unchanged", () => {
    expect(migrateSessions(v1, SCHEMA_VERSION)).toBe(v1);
  });

  it("runs on data loaded from this device and on the cloud copy", () => {
    const local = reducer(initialState, { type: "LOAD_DATA", payload: { schemaVersion: 1, sessions: v1 } });
    expect(local.sessions["2026-09-20"].sentences.map((s) => s.kind)).toEqual(["speak", "cloze"]);

    const merged = reducer(reducer(initialState, { type: "LOAD_DATA", payload: {} }), {
      type: "MERGE_CLOUD_DATA", payload: { schemaVersion: 1, sessions: v1 },
    });
    expect(merged.sessions["2026-09-20"].sentences.map((s) => s.kind)).toEqual(["speak", "cloze"]);
    expect(snapshotForSync(merged).schemaVersion).toBe(SCHEMA_VERSION);
  });
});
