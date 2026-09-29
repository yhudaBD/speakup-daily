// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { chatPhaseIsImmersive, useImmersiveChat } from "../../src/hooks/useImmersiveChat";

const immersive = () => document.documentElement.classList.contains("immersive-chat");

// The full-screen chat layout blocks page scrolling. It stayed on after a
// conversation ended, so the analysis and the placement result, which are
// longer than the screen, couldn't be scrolled (user report, 2026-09-29).
describe("useImmersiveChat", () => {
  it("turns the full-screen layout on while active and off after", () => {
    const { rerender, unmount } = renderHook(({ on }) => useImmersiveChat(on), { initialProps: { on: true } });
    expect(immersive()).toBe(true);
    rerender({ on: false });
    expect(immersive()).toBe(false);
    rerender({ on: true });
    unmount();
    expect(immersive()).toBe(false);
  });

  it("is on only while the conversation itself is shown", () => {
    expect(["USER_TURN", "AI_THINKING", "REPLY_FAILED"].every(chatPhaseIsImmersive)).toBe(true);
    expect(["IDLE", "ERROR", "DONE", undefined].some(chatPhaseIsImmersive)).toBe(false);
  });
});
