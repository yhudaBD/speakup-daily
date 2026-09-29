// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { HintLadder } from "../../src/components/roleplay/HintLadder";
import { useHintLadder } from "../../src/hooks/useHintLadder";

afterEach(cleanup);

const help = { hintHe: "תזמין שתייה", starter: "Can I get", sentence: { en: "Can I get a tea please?", he: "אפשר לקבל תה?" } };

// CRITICAL_REVIEW.md §5 fix #1 (IMPROVEMENT_IDEAS.md, idea 3).
describe("useHintLadder", () => {
  it("reveals one step at a time and counts each as help used", () => {
    const onHelpUsed = vi.fn();
    const { result } = renderHook(() => useHintLadder(help, { onHelpUsed }));
    expect(result.current.shown).toBe(0);
    act(() => result.current.next());
    act(() => result.current.next());
    expect(result.current.shown).toBe(2);
    expect(result.current.target).toBeNull();
    act(() => result.current.next());
    expect(result.current.target).toBe("Can I get a tea please?");
    act(() => result.current.next());
    expect(result.current.shown).toBe(3);
    expect(onHelpUsed).toHaveBeenCalledTimes(3);
  });

  it("sends the shown sentence only once it's said, and explains otherwise", () => {
    const { result } = renderHook(() => useHintLadder(help));
    act(() => result.current.next());
    act(() => result.current.next());
    act(() => result.current.next());

    let sent;
    act(() => { sent = result.current.route("Can I get a tea please?", { source: "typed" }); });
    expect(sent).toBeNull();
    expect(result.current.notice).toBe("say-it");

    act(() => { sent = result.current.route("can I get a tea please", { source: "spoken", durationMs: 900 }); });
    expect(sent).toEqual({ text: "Can I get a tea please?", turn: { source: "suggestion" } });
  });

  it("starts over on the next turn's help", () => {
    const { result, rerender } = renderHook(({ h }) => useHintLadder(h), { initialProps: { h: help } });
    act(() => result.current.next());
    rerender({ h: { ...help, hintHe: "משהו אחר" } });
    expect(result.current.shown).toBe(0);
  });
});

describe("HintLadder", () => {
  function Harness() {
    const ladder = useHintLadder(help);
    return <HintLadder ladder={ladder} help={help} showTranslation />;
  }

  it("shows the idea, then the opening words, then the full sentence to say", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /צריך עזרה/ }));
    expect(screen.getByText(/תזמין שתייה/)).toBeTruthy();
    expect(screen.queryByText(/Can I get…/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "עוד רמז" }));
    expect(screen.getByText("Can I get…")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "הראה משפט מלא" }));
    expect(screen.getByText("Can I get a tea please?")).toBeTruthy();
    expect(screen.getByText(/עכשיו תגיד את זה בקול/)).toBeTruthy();
    expect(screen.getByText("אפשר לקבל תה?")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /רמז|משפט מלא/ })).toBeNull();
  });

  it("renders nothing without help", () => {
    function Empty() {
      const ladder = useHintLadder(null);
      return <HintLadder ladder={ladder} help={null} />;
    }
    const { container } = render(<Empty />);
    expect(container.textContent).toBe("");
  });
});
