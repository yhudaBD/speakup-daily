// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { speakNaturally } from "../../src/utils/speechVoice";

// CRITICAL_REVIEW.md §6: every way out of speakNaturally calls onEnd exactly
// once, so the practice screen never stays on "playing the example…".
let spoken;
let behavior; // what each utterance does once spoken: "end" | "error" | "hang"

class FakeUtterance {
  constructor(text) { this.text = text; }
}

function installSynthesis() {
  spoken = [];
  window.speechSynthesis = {
    getVoices: () => [],
    addEventListener: () => {},
    cancel: vi.fn(() => {
      const current = spoken.at(-1);
      if (current && !current.done) { current.done = true; current.onerror?.({ error: "interrupted" }); }
    }),
    speak: vi.fn((utter) => {
      spoken.push(utter);
      utter.onstart?.();
      if (behavior === "end") setTimeout(() => { utter.done = true; utter.onend?.(); }, 10);
      if (behavior === "error") setTimeout(() => { utter.done = true; utter.onerror?.({ error: "synthesis-failed" }); }, 10);
    }),
  };
  globalThis.SpeechSynthesisUtterance = FakeUtterance;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  installSynthesis();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete window.speechSynthesis;
});

describe("speakNaturally", () => {
  it("calls onEnd once after the last segment", async () => {
    behavior = "end";
    const onEnd = vi.fn();
    const done = speakNaturally("Hello there. How are you?", { onEnd });
    await vi.runAllTimersAsync();
    await done;
    expect(spoken).toHaveLength(2);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("calls onEnd once when speaking fails", async () => {
    behavior = "error";
    const onEnd = vi.fn();
    const done = speakNaturally("Hello there. How are you?", { onEnd });
    await vi.runAllTimersAsync();
    await done;
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("stops and calls onEnd once when the browser never reports the end", async () => {
    behavior = "hang";
    const onEnd = vi.fn();
    const done = speakNaturally("Hello there.", { onEnd });
    await vi.advanceTimersByTimeAsync(1000);
    expect(onEnd).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(20_000);
    await done;
    expect(window.speechSynthesis.cancel).toHaveBeenCalledTimes(2); // on start, and by the watchdog
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("calls onEnd once when there's no speech API", async () => {
    delete window.speechSynthesis;
    const onEnd = vi.fn();
    await speakNaturally("Hello", { onEnd });
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("calls onEnd once for empty text", async () => {
    const onEnd = vi.fn();
    await speakNaturally("   ", { onEnd });
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("ends the previous playback once when a new one starts", async () => {
    behavior = "hang";
    const first = vi.fn();
    const second = vi.fn();
    speakNaturally("First.", { onEnd: first });
    speakNaturally("Second.", { onEnd: second });
    await vi.advanceTimersByTimeAsync(0);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });
});
