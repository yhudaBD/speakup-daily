// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useAudioRecorder } from "../../src/hooks/useAudioRecorder";

// A MediaRecorder stand-in: delivers one chunk and fires onstop on stop().
class FakeRecorder {
  static isTypeSupported = (type) => type === "audio/mp4";
  constructor(stream, { mimeType }) {
    this.mimeType = mimeType;
    this.state = "inactive";
    FakeRecorder.last = this;
  }
  start() { this.state = "recording"; }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["sound"], { type: this.mimeType }) });
    this.onstop?.();
  }
}

let track;
beforeEach(() => {
  vi.useFakeTimers();
  track = { stop: vi.fn() };
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [track] })) },
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// T5 in ACTION_PLAN.md: the day-1 recording, up to a minute per topic.
describe("useAudioRecorder", () => {
  it("records until stopped, with the format and duration, and releases the mic", async () => {
    const { result } = renderHook(() => useAudioRecorder({ maxMs: 60_000 }));
    await act(() => result.current.start());
    expect(result.current.isRecording).toBe(true);

    act(() => vi.advanceTimersByTime(3_000));
    expect(result.current.elapsedMs).toBeGreaterThanOrEqual(3_000);
    act(() => result.current.stop());

    expect(result.current.isRecording).toBe(false);
    expect(result.current.recording).toMatchObject({ mimeType: "audio/mp4", durationMs: 3_000 });
    expect(result.current.recording.blob.type).toBe("audio/mp4");
    expect(track.stop).toHaveBeenCalled();
  });

  it("stops by itself at the time limit", async () => {
    const { result } = renderHook(() => useAudioRecorder({ maxMs: 60_000 }));
    await act(() => result.current.start());
    act(() => vi.advanceTimersByTime(60_000));
    expect(result.current.isRecording).toBe(false);
    expect(result.current.recording.durationMs).toBe(60_000);
  });

  it("explains in Hebrew when the mic isn't allowed", async () => {
    navigator.mediaDevices.getUserMedia.mockRejectedValueOnce(Object.assign(new Error("no"), { name: "NotAllowedError" }));
    const { result } = renderHook(() => useAudioRecorder({ maxMs: 60_000 }));
    await act(() => result.current.start());
    expect(result.current.isRecording).toBe(false);
    expect(result.current.error).toMatch(/מיקרופון/);
  });

  it("clears a finished recording on reset", async () => {
    const { result } = renderHook(() => useAudioRecorder({ maxMs: 60_000 }));
    await act(() => result.current.start());
    act(() => result.current.stop());
    act(() => result.current.reset());
    expect(result.current.recording).toBeNull();
  });
});
