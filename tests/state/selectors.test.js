import { describe, expect, it } from "vitest";
import { independentSpeakingMs, repeatSpeakingMs } from "../../src/context/selectors";

// T4 in ACTION_PLAN.md. The North Star (minutes of independent speaking a
// week) counts only turns the user said out loud. Records saved before T4
// have no source or duration: they're unknown, and count as 0.
describe("independentSpeakingMs", () => {
  it("adds up only spoken user turns", () => {
    const messages = [
      { role: "assistant", content: "Hi!" },
      { role: "user", content: "A coffee please", source: "spoken", durationMs: 2400 },
      { role: "user", content: "With milk", source: "typed" },
      { role: "user", content: "I would like a cake", source: "suggestion" },
      { role: "user", content: "Where is the toilet?", source: "translated" },
      { role: "user", content: "Thanks", source: "spoken", durationMs: 1100 },
    ];
    expect(independentSpeakingMs(messages)).toBe(3500);
  });

  it("counts turns saved before T4 as unknown, not as speaking", () => {
    expect(independentSpeakingMs([{ role: "user", content: "old turn" }])).toBe(0);
    expect(independentSpeakingMs([{ role: "user", content: "x", source: "spoken" }])).toBe(0);
    expect(independentSpeakingMs(undefined)).toBe(0);
  });

  it("ignores a duration that isn't a sane number", () => {
    const messages = [
      { role: "user", content: "a", source: "spoken", durationMs: -5 },
      { role: "user", content: "b", source: "spoken", durationMs: "3000" },
      { role: "user", content: "c", source: "spoken", durationMs: NaN },
    ];
    expect(independentSpeakingMs(messages)).toBe(0);
  });
});

describe("repeatSpeakingMs", () => {
  it("adds up the recorded time of practice attempts, skipping old ones", () => {
    const sentences = [
      { sentenceId: "s1", score: 80, durationMs: 1800 },
      { sentenceId: "s2", score: 60 },
      { sentenceId: "s3", score: 90, durationMs: 2200 },
    ];
    expect(repeatSpeakingMs(sentences)).toBe(4000);
    expect(repeatSpeakingMs(undefined)).toBe(0);
  });
});
