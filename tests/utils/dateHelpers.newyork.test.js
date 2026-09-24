// West of UTC the old bugs showed up differently: new Date("YYYY-MM-DD") is
// UTC midnight, i.e. the previous evening, so the weekly chart labelled
// every bar with the day before.
process.env.TZ = "America/New_York";

import { describe, expect, it } from "vitest";
import { formatDate, parseDateKey, toDateKey } from "../../src/utils/dateHelpers";

describe("west of UTC (New York)", () => {
  it("is really running in the New York time zone", () => {
    expect(new Date("2026-09-24T02:00:00Z").getHours()).toBe(22);
  });

  it("parses a day key as that local date", () => {
    expect(new Date("2026-09-24").getDay()).toBe(3); // the old behavior: Wednesday
    expect(parseDateKey("2026-09-24").getDay()).toBe(4); // Thursday
  });

  it("formats a day key as that date", () => {
    expect(formatDate("2026-09-24")).toBe("Thu, Sep 24");
  });

  it("files 22:00 local time under today's date, not tomorrow's UTC date", () => {
    expect(toDateKey(new Date("2026-09-24T22:00:00-04:00"))).toBe("2026-09-24");
  });
});
