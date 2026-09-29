import { describe, expect, it } from "vitest";
import { cloudSchemaFor } from "../../src/cloud/flags";
import { baselineFor, legacyFingerprint, migrationOps } from "../../src/cloud/migrationFlow";

// MIGRATION_PLAN.md §8: staged rollout, and a move that can be cut off and
// run again.
describe("cloudSchemaFor", () => {
  it("keeps everyone on the old structure unless switched on", () => {
    expect(cloudSchemaFor("dana@example.com", {})).toBe("v2");
    expect(cloudSchemaFor("dana@example.com", { VITE_CLOUD_SCHEMA: "v2" })).toBe("v2");
  });

  it("moves listed accounts first, then everyone", () => {
    const env = { VITE_CLOUD_V3_EMAILS: " Owner@Example.com , other@example.com" };
    expect(cloudSchemaFor("owner@example.com", env)).toBe("v3");
    expect(cloudSchemaFor("dana@example.com", env)).toBe("v2");
    expect(cloudSchemaFor(undefined, env)).toBe("v2");
    expect(cloudSchemaFor("dana@example.com", { VITE_CLOUD_SCHEMA: "v3" })).toBe("v3");
  });
});

describe("migrationOps", () => {
  const docs = {
    profile: { schemaVersion: 3, settings: { dailyGoal: 5 } },
    months: { "2026-09": { month: "2026-09", days: { "2026-09-29": { attempts: {} } } } },
    chats: { c1: { id: "c1", messages: [] } },
  };

  it("writes everything, the profile last with when it moved and the old document's fingerprint", () => {
    const ops = migrationOps(docs, { now: "T", fingerprint: "abc" });
    expect(ops.map((o) => o.doc)).toEqual(["months/2026-09", "chats/c1", "profile/main"]);
    expect(Object.fromEntries(ops.at(-1).fields.map(([path, v]) => [path.join("."), v]))).toMatchObject({
      schemaVersion: 3, migratedAt: "T", legacyFingerprint: "abc",
    });
  });
});

describe("legacyFingerprint", () => {
  it("changes when the old document changes, whatever the key order", () => {
    expect(legacyFingerprint({ a: 1, b: { c: 2 } })).toBe(legacyFingerprint({ b: { c: 2 }, a: 1 }));
    expect(legacyFingerprint({ a: 1 })).not.toBe(legacyFingerprint({ a: 2 }));
    expect(legacyFingerprint(null)).toBe(legacyFingerprint(null));
  });
});

describe("baselineFor", () => {
  const chat = (id, updatedAt) => ({ id, updatedAt });
  const loaded = { profile: { p: 1 }, months: { m: 1 }, chats: { c3: chat("c3", "2026-09-03"), c4: chat("c4", "2026-09-04") } };

  it("counts older local chats as already in the cloud when the recent ones filled the page", () => {
    const local = { chats: { c1: chat("c1", "2026-09-01"), c3: chat("c3", "2026-09-03"), c9: chat("c9", "2026-09-09") } };
    const baseline = baselineFor(loaded, local, { recentLimit: 2 });
    expect(Object.keys(baseline.chats).sort()).toEqual(["c1", "c3", "c4"]);
    expect(baseline.profile).toBe(loaded.profile);
    expect(baseline.months).toBe(loaded.months);
  });

  it("writes every local chat the cloud doesn't have when it returned them all", () => {
    const local = { chats: { c1: chat("c1", "2026-09-01") } };
    expect(Object.keys(baselineFor(loaded, local, { recentLimit: 20 }).chats).sort()).toEqual(["c3", "c4"]);
  });
});
