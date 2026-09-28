import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  deleteBaselineRecordings, listBaselineRecordings, saveBaselineRecording,
} from "../../src/services/baselineRecordings";

// T5 in ACTION_PLAN.md: "day 1" recordings stay on this device only, in
// IndexedDB, per account.
const audio = (text, type = "audio/webm") => new Blob([text], { type });

beforeEach(async () => {
  await deleteBaselineRecordings("uid-a");
  await deleteBaselineRecordings("uid-b");
});

describe("baseline recordings", () => {
  it("saves a recording with its format and duration, and reads it back as audio", async () => {
    await saveBaselineRecording("uid-a", { promptId: "morning", blob: audio("abc", "audio/mp4"), mimeType: "audio/mp4", durationMs: 41000 });
    const [rec] = await listBaselineRecordings("uid-a");
    expect(rec).toMatchObject({ promptId: "morning", mimeType: "audio/mp4", durationMs: 41000 });
    expect(rec.blob.type).toBe("audio/mp4");
    expect(await rec.blob.text()).toBe("abc");
    expect(rec.recordedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("replaces a topic's recording when it's recorded again", async () => {
    await saveBaselineRecording("uid-a", { promptId: "morning", blob: audio("first"), mimeType: "audio/webm", durationMs: 1000 });
    await saveBaselineRecording("uid-a", { promptId: "morning", blob: audio("second"), mimeType: "audio/webm", durationMs: 2000 });
    const recs = await listBaselineRecordings("uid-a");
    expect(recs).toHaveLength(1);
    expect(await recs[0].blob.text()).toBe("second");
  });

  it("keeps each account's recordings apart, and deletes only that account's", async () => {
    await saveBaselineRecording("uid-a", { promptId: "morning", blob: audio("a"), mimeType: "audio/webm", durationMs: 1 });
    await saveBaselineRecording("uid-b", { promptId: "morning", blob: audio("b"), mimeType: "audio/webm", durationMs: 1 });
    expect(await listBaselineRecordings("uid-a")).toHaveLength(1);

    await deleteBaselineRecordings("uid-a");
    expect(await listBaselineRecordings("uid-a")).toEqual([]);
    expect(await listBaselineRecordings("uid-b")).toHaveLength(1);
  });
});
