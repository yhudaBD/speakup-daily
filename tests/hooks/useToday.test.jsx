// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useToday } from "../../src/hooks/useToday";

// CRITICAL_REVIEW.md §28: a PWA left open overnight must see the new day
// when it comes back, not yesterday's "goal complete".
describe("useToday", () => {
  afterEach(() => vi.useRealTimers());

  it("moves to the new day when the app comes back into view", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 28, 23, 50));
    const { result } = renderHook(() => useToday());
    expect(result.current).toBe("2026-09-28");

    vi.setSystemTime(new Date(2026, 8, 29, 7, 30));
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(result.current).toBe("2026-09-29");
  });
});
