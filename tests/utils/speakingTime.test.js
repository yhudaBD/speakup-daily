import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/utils/analytics", () => ({ logEvent: vi.fn() }));
const { logEvent } = await import("../../src/utils/analytics");
const { reportSpeakingTime } = await import("../../src/utils/speakingTime");

beforeEach(() => logEvent.mockClear());

// T4 in ACTION_PLAN.md.
describe("reportSpeakingTime", () => {
  it("reports a practice session's read-aloud time in whole seconds", () => {
    reportSpeakingTime("user_1", "practice", { sentences: [{ score: 80, durationMs: 1800 }, { score: 70, durationMs: 2300 }, { score: 60 }] });
    expect(logEvent).toHaveBeenCalledWith("user_1", "speaking_time", { kind: "practice", independent_sec: 0, repeat_sec: 4 });
  });

  it("sends nothing when there's no measured speaking", () => {
    reportSpeakingTime("user_1", "practice", { sentences: [{ score: 60 }] });
    reportSpeakingTime("user_1", "roleplay", { messages: [{ role: "user", content: "hi", source: "typed" }] });
    expect(logEvent).not.toHaveBeenCalled();
  });
});
