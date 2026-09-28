// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The dashboard is a static page with its own script (public/). Its
// listeners are bound in usage_dashboard.js rather than onclick attributes,
// so this checks the page still works through them. (Paths, not file URLs:
// under jsdom, URL is jsdom's class and fs won't take it.)
const html = readFileSync(resolve("public/usage_dashboard.html"), "utf8");
const script = readFileSync(resolve("public/usage_dashboard.js"), "utf8");

const data = {
  generatedAt: "2026-09-28T10:00:00.000Z",
  summary: {
    totalUsers: 2, weeklyActiveUsers: 1, popularTopics: [], totalCostUsd: 0.5,
    largeCloudDocs: { "700-800KB": 0, "800-900KB": 1, "900KB+": 0 },
  },
  users: [
    { userLabel: "…abc123", activeDates: [], placementLevel: "A2", currentLevel: "B1", daysSinceActive: 0,
      avgHelpUsed: null, helpTrend: null, topicCounts: { Cafe: 2 }, estimatedCostUsd: 0.2 },
    { userLabel: "…xyz789", activeDates: [], placementLevel: null, currentLevel: null, daysSinceActive: 5,
      avgHelpUsed: 1, helpTrend: "down", topicCounts: {}, estimatedCostUsd: 0.3 },
  ],
};

const $ = (id) => document.getElementById(id);
const click = (el) => el.dispatchEvent(new MouseEvent("click", { bubbles: true }));

beforeEach(() => {
  sessionStorage.clear();
  document.body.innerHTML = html.slice(html.indexOf("<body>") + 6, html.indexOf("</body>"));
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(data), { status: 200 })));
  new Function(script)();
});
afterEach(() => vi.unstubAllGlobals());

describe("usage dashboard", () => {
  it("logs in from the button and renders a row per user", async () => {
    $("secretInput").value = "s3cret";
    click($("loginBtn"));
    await vi.waitFor(() => expect($("dashboard").hidden).toBe(false));
    expect(fetch).toHaveBeenCalledWith("/api/get-dashboard-data", expect.objectContaining({
      headers: expect.objectContaining({ "X-Admin-Secret": "s3cret" }),
    }));
    expect($("usersBody").querySelectorAll("tr[data-index]")).toHaveLength(2);
    expect($("largeDocs").hidden).toBe(false);
    expect($("largeDocs").textContent).toContain("800-900KB: 1");
    expect($("largeDocs").textContent).not.toContain("700-800KB");
  });

  it("opens a user's details from any cell in the row, and closes them", async () => {
    $("secretInput").value = "s3cret";
    click($("loginBtn"));
    await vi.waitFor(() => expect($("dashboard").hidden).toBe(false));

    click($("usersBody").querySelectorAll("tr[data-index]")[1].querySelector("td"));
    expect($("userModalBackdrop").hidden).toBe(false);
    expect($("modalName").textContent).toBe("…xyz789");

    click($("closeModalBtn"));
    expect($("userModalBackdrop").hidden).toBe(true);

    click($("usersBody").querySelector("tr[data-index] td"));
    click($("modalName"));
    expect($("userModalBackdrop").hidden).toBe(false);
    click($("userModalBackdrop"));
    expect($("userModalBackdrop").hidden).toBe(true);
  });

  it("refreshes from the refresh button", async () => {
    sessionStorage.setItem("speakup_admin_secret", "s3cret");
    click($("refreshBtn"));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
  });
});
