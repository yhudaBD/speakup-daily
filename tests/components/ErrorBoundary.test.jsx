// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../src/services/errorReporting", () => ({ reportError: vi.fn() }));
const { reportError } = await import("../../src/services/errorReporting");
const { AppCrashScreen, ErrorBoundary, RouteErrorBoundary } = await import("../../src/components/ErrorBoundary");

let shouldThrow;
function Flaky() {
  if (shouldThrow) throw new Error("render exploded");
  return <p>page content</p>;
}

beforeEach(() => {
  shouldThrow = true;
  reportError.mockClear();
  // React logs caught render errors to console.error; keep test output clean.
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("RouteErrorBoundary", () => {
  const renderRoute = () =>
    render(
      <MemoryRouter>
        <nav>bottom nav</nav>
        <RouteErrorBoundary>
          <Flaky />
        </RouteErrorBoundary>
      </MemoryRouter>,
    );

  it("contains a page crash and keeps the rest of the app on screen", () => {
    renderRoute();
    expect(screen.getByRole("alert").textContent).toContain("הדף הזה נתקע");
    expect(screen.getByText("bottom nav")).toBeTruthy();
    expect(reportError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "render exploded" }),
      expect.objectContaining({ boundary: "route" }),
    );
  });

  it("renders the page again after 'try again' once the cause is gone", () => {
    renderRoute();
    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: "נסה שוב" }));
    expect(screen.getByText("page content")).toBeTruthy();
  });
});

describe("ErrorBoundary", () => {
  it("renders children untouched when nothing throws", () => {
    shouldThrow = false;
    render(<ErrorBoundary fallback={() => <p>fallback</p>}><Flaky /></ErrorBoundary>);
    expect(screen.getByText("page content")).toBeTruthy();
    expect(reportError).not.toHaveBeenCalled();
  });

  it("shows the app-wide crash screen with recovery options", () => {
    render(<ErrorBoundary name="app" fallback={() => <AppCrashScreen />}><Flaky /></ErrorBoundary>);
    expect(screen.getByRole("heading", { name: "משהו השתבש" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "טען מחדש" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "נקה נתונים במכשיר וטען מחדש" })).toBeTruthy();
  });
});
