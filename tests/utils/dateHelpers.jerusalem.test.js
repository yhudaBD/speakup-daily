// Must run before any Date is created in this file's worker.
process.env.TZ = "Asia/Jerusalem";

import { afterEach, describe, expect, it, vi } from "vitest";
import { daysSince, getLastNDays, getTodayString, toDateKey } from "../../src/utils/dateHelpers";
import { selectStreak, streakRun } from "../../src/context/selectors";

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

// The streak is derived from the active days (§19); the day arithmetic has
// to hold across month, year and daylight-saving boundaries.
describe("streak across calendar boundaries", () => {
  const spoke = { sentences: [{ sentenceId: "s", score: 80, kind: "speak" }] };
  const days = (...keys) => Object.fromEntries(keys.map((k) => [k, spoke]));

  it("continues across month and year boundaries", () => {
    expect(streakRun(days("2026-09-29", "2026-09-30", "2026-10-01")).current).toBe(3);
    expect(streakRun(days("2026-12-30", "2026-12-31", "2027-01-01")).current).toBe(3);
  });

  it("continues across the end of daylight saving time", () => {
    const sessions = days("2026-10-24", "2026-10-25", "2026-10-26");
    expect(streakRun(sessions).current).toBe(3);
    expect(selectStreak({ sessions }, "2026-10-27")).toBe(3);
  });

  it("restarts after a missed day", () => {
    expect(streakRun(days("2026-09-20", "2026-09-21", "2026-09-23", "2026-09-24")).current).toBe(2);
  });
});
