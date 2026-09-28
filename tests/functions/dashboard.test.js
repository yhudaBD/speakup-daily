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
    expect(stored).toMatchObject({ userId: "user_1", uid: "uid-1", details: {} });
  });

  it("doesn't store a name or email, even from an older app version that still sends one (CRITICAL_REVIEW §41א)", async () => {
    const res = await logEvent(post("/api/log-event", {
      userId: "user_1", userName: "Dana Levi", email: "dana@example.com", type: "session_started", details: {},
    }, { Authorization: "Bearer t" }));
    expect(res.status).toBe(200);
    const [stored] = blobs.values();
    expect(stored).not.toHaveProperty("userName");
    expect(stored).not.toHaveProperty("email");
    expect(JSON.stringify(stored)).not.toMatch(/Dana|dana@/);
  });

  it("accepts a cloud document size report (CRITICAL_REVIEW §1א)", async () => {
    const res = await logEvent(post("/api/log-event", {
      userId: "user_1", type: "cloud_doc_large", details: { sizeRange: "700-800KB" },
    }, { Authorization: "Bearer t" }));
    expect(res.status).toBe(200);
    expect([...blobs.values()][0]).toMatchObject({ type: "cloud_doc_large", details: { sizeRange: "700-800KB" } });
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
    expect(data.users[0]).toMatchObject({ placementLevel: null, currentLevel: "B1" });
    expect(JSON.stringify(data)).not.toContain("onerror");
  });

  it("sums each user's independent and repeat speaking over the last 7 days (T4)", async () => {
    const day = (daysAgo) => new Date(Date.now() - daysAgo * 86400000).toISOString();
    const ev = (details, ts) => ({ userId: "user_1", type: "speaking_time", details, ts });
    blobs.set("1", ev({ kind: "roleplay", independent_sec: 40, repeat_sec: 0 }, day(1)));
    blobs.set("2", ev({ kind: "practice", independent_sec: 0, repeat_sec: 25 }, day(2)));
    blobs.set("3", ev({ kind: "roleplay", independent_sec: 30, repeat_sec: 0 }, day(3)));
    blobs.set("4", ev({ kind: "roleplay", independent_sec: 500, repeat_sec: 0 }, day(10)));
    const res = await getDashboardData(post("/api/get-dashboard-data", {}, { "X-Admin-Secret": "correct-horse" }));
    const { users } = await res.json();
    expect(users[0]).toMatchObject({ independentSec7d: 70, repeatSec7d: 25 });
  });

  it("accepts a speaking time report (T4)", async () => {
    const res = await logEvent(post("/api/log-event", {
      userId: "user_1", type: "speaking_time", details: { kind: "roleplay", independent_sec: 12, repeat_sec: 0 },
    }, { Authorization: "Bearer t" }));
    expect(res.status).toBe(200);
  });

  it("counts users by the largest cloud document size they reported (CRITICAL_REVIEW §1א)", async () => {
    const ev = (userId, sizeRange, ts) => ({ userId, type: "cloud_doc_large", details: { sizeRange }, ts });
    blobs.set("1", ev("user_1", "700-800KB", "2026-09-20T10:00:00.000Z"));
    blobs.set("2", ev("user_1", "800-900KB", "2026-09-21T10:00:00.000Z"));
    blobs.set("3", ev("user_2", "700-800KB", "2026-09-21T10:00:00.000Z"));
    const res = await getDashboardData(post("/api/get-dashboard-data", {}, { "X-Admin-Secret": "correct-horse" }));
    const { summary } = await res.json();
    expect(summary.largeCloudDocs).toEqual({ "700-800KB": 1, "800-900KB": 1, "900KB+": 0 });
  });

  it("labels users by the end of their uid, and never shows a stored name (CRITICAL_REVIEW §41א)", async () => {
    blobs.set("a", {
      userId: "user_1", uid: "firebase-uid-abc123", userName: "Dana Levi", type: "session_started",
      details: {}, ts: "2026-09-21T10:00:00.000Z",
    });
    blobs.set("b", { userId: "user_legacy_xyz789", type: "session_started", details: {}, ts: "2026-09-20T10:00:00.000Z" });
    const res = await getDashboardData(post("/api/get-dashboard-data", {}, { "X-Admin-Secret": "correct-horse" }));
    const data = await res.json();
    expect(data.users.map((u) => u.userLabel).sort()).toEqual(["…abc123", "…xyz789"]);
    expect(JSON.stringify(data)).not.toMatch(/Dana|userName/);
  });
});
