// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const dispatch = vi.fn();
vi.mock("../../src/context/AppContext", () => ({
  useApp: () => ({ dispatch, firebaseUser: { uid: "uid-a" } }),
}));

// The recorder is driven by the test: `take` is the clip a stop produces.
let recorderState;
const take = { blob: new Blob(["clip"], { type: "audio/mp4" }), mimeType: "audio/mp4", durationMs: 42_000 };
vi.mock("../../src/hooks/useAudioRecorder", () => ({
  useAudioRecorder: () => recorderState,
}));

const saveBaselineRecording = vi.fn(async () => {});
const requestPersistentStorage = vi.fn(async () => true);
vi.mock("../../src/services/baselineRecordings", () => ({
  saveBaselineRecording: (...args) => saveBaselineRecording(...args),
  requestPersistentStorage: () => requestPersistentStorage(),
  dismissBaselineForNow: () => sessionStorage.setItem("speakup_baseline_dismissed", "1"),
}));

const { default: BaselineRecording } = await import("../../src/pages/BaselineRecording");

beforeEach(() => {
  sessionStorage.clear();
  dispatch.mockClear();
  saveBaselineRecording.mockClear();
  recorderState = {
    isRecording: false, elapsedMs: 0, recording: null, error: null,
    start: vi.fn(), stop: vi.fn(), reset: vi.fn(() => { recorderState.recording = null; }),
  };
  URL.createObjectURL = vi.fn(() => "blob:clip");
  URL.revokeObjectURL = vi.fn();
});
afterEach(cleanup);

function renderScreen(next) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/baseline", state: next ? { next } : undefined }]}>
      <Routes>
        <Route path="/baseline" element={<BaselineRecording />} />
        <Route path="/" element={<p>home page</p>} />
        <Route path="/progress" element={<p>progress page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

// T5 in ACTION_PLAN.md.
describe("BaselineRecording", () => {
  it("says the recording stays on this device", () => {
    renderScreen();
    expect(document.body.textContent).toContain("ההקלטה נשמרת רק במכשיר הזה. בעוד חודש נקליט שוב ונשמע את ההבדל.");
  });

  it("'don't record' saves the choice and moves on", () => {
    renderScreen({ to: "/progress" });
    fireEvent.click(screen.getByRole("button", { name: "לא להקליט" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "SET_BASELINE", payload: { status: "declined" } });
    expect(screen.getByText("progress page")).toBeTruthy();
  });

  it("'not now' saves nothing and hides the offer for this visit", () => {
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "לא עכשיו" }));
    expect(dispatch).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("speakup_baseline_dismissed")).toBe("1");
    expect(screen.getByText("home page")).toBeTruthy();
  });

  it("saves a recorded topic on this device, and marks day 1 done after the last topic", async () => {
    const { rerender } = renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "בואו נתחיל" }));
    expect(screen.getByText(/נושא 1 מתוך 3/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /התחל להקליט/ }));
    expect(recorderState.start).toHaveBeenCalled();

    recorderState = { ...recorderState, recording: take };
    rerender(
      <MemoryRouter initialEntries={["/baseline"]}>
        <Routes><Route path="/baseline" element={<BaselineRecording />} /></Routes>
      </MemoryRouter>,
    );
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "שמור והמשך" })); });

    expect(saveBaselineRecording).toHaveBeenCalledWith("uid-a", {
      promptId: "typical-morning", blob: take.blob, mimeType: "audio/mp4", durationMs: 42_000,
    });
    expect(requestPersistentStorage).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText(/נושא 2 מתוך 3/)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "דלג על הנושא" }));
    fireEvent.click(screen.getByRole("button", { name: "דלג על הנושא" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "SET_BASELINE", payload: { status: "recorded" } });
    expect(screen.getByText(/נשמר/)).toBeTruthy();
  });

  it("treats skipping every topic as 'not now', not as recorded", () => {
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "בואו נתחיל" }));
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole("button", { name: "דלג על הנושא" }));
    expect(dispatch).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("speakup_baseline_dismissed")).toBe("1");
    expect(screen.getByText("home page")).toBeTruthy();
  });
});
