import { describe, expect, it } from "vitest";
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
