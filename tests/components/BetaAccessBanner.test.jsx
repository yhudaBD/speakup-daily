// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import BetaAccessBanner from "../../src/components/layout/BetaAccessBanner";
import { markNotInBeta } from "../../src/services/betaAccess";

afterEach(cleanup);

// The module keeps its state for the whole file, so the order matters.
describe("BetaAccessBanner", () => {
  it("shows nothing while the account has access", () => {
    const { container } = render(<BetaAccessBanner />);
    expect(container.innerHTML).toBe("");
  });

  it("explains in Hebrew once the proxy refuses the account", () => {
    render(<BetaAccessBanner />);
    act(() => markNotInBeta());
    expect(screen.getByRole("status").textContent).toContain("התרגול עם AI פתוח כרגע למשתתפי הבטא בלבד");
  });

  it("stays up for a page that mounts after the refusal", () => {
    render(<BetaAccessBanner />);
    expect(screen.getByRole("status")).toBeTruthy();
  });
});
