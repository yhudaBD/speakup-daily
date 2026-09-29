import { describe, expect, it } from "vitest";
import { cloudSchemaFor, emailHash } from "../../src/cloud/flags";
import { baselineFor, legacyFingerprint, migrationOps } from "../../src/cloud/migrationFlow";

// MIGRATION_PLAN.md §8: staged rollout, and a move that can be cut off and
// run again.
describe("cloudSchemaFor", () => {
  it("keeps everyone on the old structure unless switched on", async () => {
    expect(await cloudSchemaFor("dana@example.com", {})).toBe("v2");
    expect(await cloudSchemaFor("dana@example.com", { VITE_CLOUD_SCHEMA: "v2" })).toBe("v2");
  });

  it("moves listed accounts first, then everyone", async () => {
    const env = { VITE_CLOUD_V3_EMAIL_HASHES: ` ${await emailHash("owner@example.com")} , ${await emailHash("other@example.com")}` };
    expect(await cloudSchemaFor("Owner@Example.com ", env)).toBe("v3");
    expect(await cloudSchemaFor("dana@example.com", env)).toBe("v2");
    expect(await cloudSchemaFor(undefined, env)).toBe("v2");
    expect(await cloudSchemaFor("dana@example.com", { VITE_CLOUD_SCHEMA: "v3" })).toBe("v3");
  });

  // VITE_ variables ship in the bundle anyone can read, so the list holds
  // hashes and not the addresses themselves.
  it("lists accounts by the SHA-256 of the address, lowercased", async () => {
    // sha256("abc"), the standard test vector.
    expect(await emailHash("ABC ")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(await cloudSchemaFor("owner@example.com", { VITE_CLOUD_V3_EMAIL_HASHES: "owner@example.com" })).toBe("v2");
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
