import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/services/firebase", () => ({
  auth: { currentUser: { getIdToken: async () => "token-1", displayName: "Dana Levi", email: "dana@example.com" } },
}));
const { deleteMyEvents, logEvent } = await import("../../src/utils/analytics");

const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

// CRITICAL_REVIEW.md §41א: usage events carry no name or email.
describe("logEvent", () => {
  it("sends the device id, type and details, and nothing that names the user", async () => {
    logEvent("user_1", "session_started", { kind: "roleplay", topicId: "cafe" });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/log-event");
    expect(init.headers.Authorization).toBe("Bearer token-1");
    const body = JSON.parse(init.body);
    expect(body).toEqual({ userId: "user_1", type: "session_started", details: { kind: "roleplay", topicId: "cafe" } });
    expect(init.body).not.toMatch(/userName|email|Dana|dana@/);
  });
});

// CRITICAL_REVIEW.md §41ב: "delete account" deletes the usage events too,
// and fails loudly rather than leaving them behind.
describe("deleteMyEvents", () => {
  it("asks the server to delete this user's events, signed in", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, deleted: 3 }), { status: 200 }));
    await expect(deleteMyEvents()).resolves.toBe(3);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/delete-my-events");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer token-1");
  });

  it("throws when the server couldn't delete them", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 500 }));
    await expect(deleteMyEvents()).rejects.toThrow();
  });
});
