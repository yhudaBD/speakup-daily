// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { readBaseline, saveBaseline } from "../../src/cloud/localBaseline";
import { STORAGE_KEY } from "../../src/context/appState";
import { listBaselineRecordings, saveBaselineRecording } from "../../src/services/baselineRecordings";
import { clearLocalAccountData } from "../../src/services/localAccountData";

// T5 in ACTION_PLAN.md and the privacy rule in CLAUDE.md: "delete account"
// erases everything personal this device holds, recordings included.
describe("clearLocalAccountData (delete account)", () => {
  it("removes the saved app data and the account's day-1 recordings", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ownerUid: "uid-a" }));
    saveBaseline("uid-a", { since: 1, docs: { profile: {}, months: {}, chats: {} } });
    await saveBaselineRecording("uid-a", { promptId: "morning", blob: new Blob(["x"]), mimeType: "audio/webm", durationMs: 5 });
    await saveBaselineRecording("uid-b", { promptId: "morning", blob: new Blob(["y"]), mimeType: "audio/webm", durationMs: 5 });

    await clearLocalAccountData("uid-a");

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(readBaseline("uid-a")).toBeNull();
    expect(await listBaselineRecordings("uid-a")).toEqual([]);
    expect(await listBaselineRecordings("uid-b")).toHaveLength(1);
  });
});
