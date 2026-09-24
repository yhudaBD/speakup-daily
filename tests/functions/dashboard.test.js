import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "../../netlify/functions/_shared/http.js";

const blobs = new Map();
vi.mock("@netlify/blobs", () => ({
  getStore: () => ({
    setJSON: async (key, value) => { blobs.set(key, value); },
    list: async () => ({ blobs: [...blobs.keys()].map((key) => ({ key })) }),
    get: async (key) => blobs.get(key) ?? null,
  }),
}));
vi.mock("../../netlify/functions/_shared/auth.js", () => ({
  requireUser: vi.fn(async (req) => {
    if (!req.headers.get("authorization")) throw new HttpError(401, "missing_token", "Sign-in required");
    return "uid-1";
  }),
}));

const { default: logEvent } = await import("../../netlify/functions/log-event.js");
const { default: getDashboardData } = await import("../../netlify/functions/get-dashboard-data.js");

beforeEach(() => {
  blobs.clear();
  process.env.ADMIN_SECRET = "correct-horse";
});

const post = (url, body, headers = {}) =>
  new Request(`http://localhost${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

describe("log-event", () => {
  it("rejects anonymous writes", async () => {
    const res = await logEvent(post("/api/log-event", { userId: "u", type: "session_started" }));
    expect(res.status).toBe(401);
    expect(blobs.size).toBe(0);
  });

  it("stores only sanitized details", async () => {
    const res = await logEvent(post("/api/log-event", {
      userId: "user_1", userName: "Dana", type: "placement_completed",
      details: { level: "<img src=x onerror=alert(1)>", extra: "x" },
    }, { Authorization: "Bearer t" }));
    expect(res.status).toBe(200);
    const [stored] = blobs.values();
    expect(stored).toMatchObject({ userId: "user_1", uid: "uid-1", userName: "Dana", details: {} });
  });

  it("rejects unknown event types", async () => {
    const res = await logEvent(post("/api/log-event", { userId: "u", type: "drop_table" }, { Authorization: "Bearer t" }));
    expect(res.status).toBe(400);
  });
});

describe("get-dashboard-data", () => {
  it("rejects a wrong secret", async () => {
    const res = await getDashboardData(post("/api/get-dashboard-data", {}, { "X-Admin-Secret": "nope" }));
    expect(res.status).toBe(401);
  });

  it("no longer accepts the secret in the body", async () => {
    const res = await getDashboardData(post("/api/get-dashboard-data", { secret: "correct-horse" }));
    expect(res.status).toBe(401);
  });

  it("returns aggregated data and scrubs events stored before sanitizing existed", async () => {
    blobs.set("old", {
      userId: "user_1", userName: "Dana", type: "placement_completed",
      details: { level: "<img src=x onerror=alert(1)>" }, ts: "2026-09-20T10:00:00.000Z",
    });
    blobs.set("new", {
      userId: "user_1", userName: "Dana", type: "session_ended",
      details: { kind: "roleplay", currentLevel: "B1", turnCount: 4, helpUsedCount: 1, topicTitle: "Café" },
      ts: "2026-09-21T10:00:00.000Z",
    });
    const res = await getDashboardData(post("/api/get-dashboard-data", {}, { "X-Admin-Secret": "correct-horse" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.users[0]).toMatchObject({ userName: "Dana", placementLevel: null, currentLevel: "B1" });
    expect(JSON.stringify(data)).not.toContain("onerror");
  });
});
