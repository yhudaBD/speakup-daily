// Must run before any Date is created in this file's worker.
process.env.TZ = "Asia/Jerusalem";

import { afterEach, describe, expect, it, vi } from "vitest";
import { daysSince, getLastNDays, getTodayString, toDateKey } from "../../src/utils/dateHelpers";
import { computeStreak } from "../../src/context/appState";

afterEach(() => vi.useRealTimers());

describe("in Israel (UTC+3 in summer)", () => {
  it("is really running in the Jerusalem time zone", () => {
    expect(new Date("2026-09-23T21:30:00Z").getHours()).toBe(0);
  });

  it("files 00:30 local time under today's date, not yesterday's UTC date", () => {
    const halfPastMidnight = new Date("2026-09-24T00:30:00+03:00");
    expect(halfPastMidnight.toISOString().slice(0, 10)).toBe("2026-09-23"); // the old behavior
    expect(toDateKey(halfPastMidnight)).toBe("2026-09-24");

    vi.useFakeTimers();
    vi.setSystemTime(halfPastMidnight);
    expect(getTodayString()).toBe("2026-09-24");
  });

  it("lists the last N local days ending today", () => {
    expect(getLastNDays(3, new Date("2026-09-24T01:00:00+03:00"))).toEqual(["2026-09-22", "2026-09-23", "2026-09-24"]);
  });

  it("counts whole days across the end of daylight saving time", () => {
    // Israel leaves DST on 2026-10-25; that day is 25 hours long.
    expect(daysSince("2026-10-24", new Date("2026-10-26T12:00:00+02:00"))).toBe(2);
    expect(daysSince("2026-10-26", new Date("2026-10-26T00:10:00+02:00"))).toBe(0);
    expect(daysSince(null)).toBe(Infinity);
  });
});

describe("computeStreak", () => {
  const streak = (current, longest, lastPracticeDate) => ({ current, longest, lastPracticeDate });

  it("continues the streak when the last practice was yesterday", () => {
    expect(computeStreak(streak(3, 5, "2026-09-23"), "2026-09-24")).toEqual(streak(4, 5, "2026-09-24"));
  });

  it("keeps the streak unchanged for a second session the same day", () => {
    expect(computeStreak(streak(4, 5, "2026-09-24"), "2026-09-24")).toEqual(streak(4, 5, "2026-09-24"));
  });

  it("restarts at 1 after a missed day and tracks the longest streak", () => {
    expect(computeStreak(streak(7, 7, "2026-09-21"), "2026-09-24")).toEqual(streak(1, 7, "2026-09-24"));
    expect(computeStreak(streak(7, 7, "2026-09-23"), "2026-09-24")).toEqual(streak(8, 8, "2026-09-24"));
  });

  it("handles month and year boundaries", () => {
    expect(computeStreak(streak(2, 2, "2026-09-30"), "2026-10-01").current).toBe(3);
    expect(computeStreak(streak(2, 2, "2026-12-31"), "2027-01-01").current).toBe(3);
  });

  it("starts a first-ever streak at 1", () => {
    expect(computeStreak(streak(0, 0, null), "2026-09-24")).toEqual(streak(1, 1, "2026-09-24"));
  });
});
