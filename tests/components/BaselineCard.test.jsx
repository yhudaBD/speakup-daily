// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

let appState;
vi.mock("../../src/context/AppContext", () => ({ useApp: () => ({ state: appState }) }));
const { default: BaselineCard } = await import("../../src/components/home/BaselineCard");

beforeEach(() => {
  sessionStorage.clear();
  appState = { isLoaded: true, placement: { overall_level: "B1" }, baseline: null };
});
afterEach(cleanup);

const renderCard = () =>
  render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<BaselineCard />} />
        <Route path="/baseline" element={<p>baseline screen</p>} />
      </Routes>
    </MemoryRouter>,
  );

// T5 in ACTION_PLAN.md: an existing user is offered the day-1 recording on
// the home page until they record it or decline it.
describe("BaselineCard", () => {
  it("offers the recording, and opens it", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: /יום 1/ }));
    expect(screen.getByText("baseline screen")).toBeTruthy();
  });

  it("waits until the placement conversation is done", () => {
    appState.placement = null;
    renderCard();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("goes away once recorded or declined", () => {
    appState.baseline = { status: "declined", at: "2026-09-28T10:00:00.000Z" };
    renderCard();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("stays hidden for the rest of the visit after 'not now'", () => {
    sessionStorage.setItem("speakup_baseline_dismissed", "1");
    renderCard();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
