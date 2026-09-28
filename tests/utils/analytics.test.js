import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/services/firebase", () => ({
  auth: { currentUser: { getIdToken: async () => "token-1", displayName: "Dana Levi", email: "dana@example.com" } },
}));
const { logEvent } = await import("../../src/utils/analytics");

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
