// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import CloudSyncBanner from "../../src/components/layout/CloudSyncBanner";
import { createCloudSyncTracker } from "../../src/services/cloudSync";

afterEach(cleanup);

// CRITICAL_REVIEW.md §1א.
describe("CloudSyncBanner", () => {
  it("appears while changes are only on this device, and goes once a write lands", async () => {
    const tracker = createCloudSyncTracker();
    render(<CloudSyncBanner tracker={tracker} />);
    expect(screen.queryByRole("status")).toBeNull();

    await act(() => tracker.track(Promise.reject(new Error("offline"))).catch(() => {}));
    expect(screen.getByRole("status").textContent).toContain("השינויים נשמרים כרגע רק במכשיר הזה");

    await act(() => tracker.track(Promise.resolve()));
    expect(screen.queryByRole("status")).toBeNull();
  });
});
