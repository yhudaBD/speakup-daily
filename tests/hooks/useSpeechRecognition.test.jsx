// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

let voice;
vi.mock("../../src/hooks/useVoiceInput", () => ({
  useVoiceInput: ({ onResult }) => {
    voice = { onResult };
    return {
      isRecording: false, isTranscribing: false, liveTranscript: "", error: null, speechSupported: true,
      startRecording: vi.fn(), stopRecording: vi.fn(),
    };
  },
}));
const { useSpeechRecognition } = await import("../../src/hooks/useSpeechRecognition");

// T4 in ACTION_PLAN.md: practice attempts carry how long the recording ran.
describe("useSpeechRecognition", () => {
  it("exposes the recording's duration with the transcript, and clears it on a new start", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => voice.onResult("I need water", { durationMs: 1700 }));
    expect(result.current.transcript).toBe("I need water");
    expect(result.current.durationMs).toBe(1700);

    act(() => result.current.start());
    expect(result.current.durationMs).toBeNull();
  });
});
