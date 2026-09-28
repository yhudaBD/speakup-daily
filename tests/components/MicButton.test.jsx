// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

// The mic hook is replaced so a test can "say" something: onResult is what
// useVoiceInput calls with the transcript and how long the recording ran.
let voice;
vi.mock("../../src/hooks/useVoiceInput", () => ({
  useVoiceInput: ({ onResult }) => {
    voice = { onResult };
    return {
      isRecording: false, isTranscribing: false, liveTranscript: "", error: null, speechSupported: true,
      startRecording: vi.fn(), stopRecording: vi.fn(), clearError: vi.fn(),
    };
  },
}));
const { MicButton } = await import("../../src/components/roleplay/MicButton");

let onSpoke;
beforeEach(() => { onSpoke = vi.fn(); });
afterEach(cleanup);

const renderMic = (props = {}) =>
  render(<MicButton phase="USER_TURN" onSpoke={onSpoke} insertText="" onInsertConsumed={() => {}} {...props} />);
const input = () => screen.getByRole("textbox");
const send = () => fireEvent.keyDown(input(), { key: "Enter" });

// T4 in ACTION_PLAN.md: every user turn says how it was made.
describe("MicButton turn source", () => {
  it("sends a transcript as spoken, with the recording's duration", () => {
    renderMic();
    act(() => voice.onResult("I need a taxi", { durationMs: 2100 }));
    send();
    expect(onSpoke).toHaveBeenCalledWith("I need a taxi", { source: "spoken", durationMs: 2100 });
  });

  it("keeps a lightly edited transcript as spoken", () => {
    renderMic();
    act(() => voice.onResult("I need a taxy", { durationMs: 2100 }));
    fireEvent.change(input(), { target: { value: "I need a taxi" } });
    send();
    expect(onSpoke).toHaveBeenCalledWith("I need a taxi", { source: "spoken", durationMs: 2100 });
  });

  it("sends typed text as typed", () => {
    renderMic();
    fireEvent.change(input(), { target: { value: "Hello there" } });
    send();
    expect(onSpoke).toHaveBeenCalledWith("Hello there", { source: "typed" });
  });

  it("sends a translation from 'how do you say' as translated, even after edits", () => {
    const { rerender } = renderMic();
    rerender(<MicButton phase="USER_TURN" onSpoke={onSpoke} insertText="Where is the station?" onInsertConsumed={() => {}} />);
    fireEvent.change(input(), { target: { value: "Where is the train station?" } });
    send();
    expect(onSpoke).toHaveBeenCalledWith("Where is the train station?", { source: "translated" });
  });

  it("starts over as typed once the field is cleared", () => {
    renderMic();
    act(() => voice.onResult("Wrong words", { durationMs: 900 }));
    fireEvent.change(input(), { target: { value: "" } });
    fireEvent.change(input(), { target: { value: "Right words" } });
    send();
    expect(onSpoke).toHaveBeenCalledWith("Right words", { source: "typed" });
  });

  it("resets to typed after sending", () => {
    renderMic();
    act(() => voice.onResult("First", { durationMs: 500 }));
    send();
    fireEvent.change(input(), { target: { value: "Second" } });
    send();
    expect(onSpoke).toHaveBeenLastCalledWith("Second", { source: "typed" });
  });
});
