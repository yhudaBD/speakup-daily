import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "../../netlify/functions/_shared/http.js";

vi.mock("../../netlify/functions/_shared/auth.js", () => ({
  requireUser: vi.fn(async (req) => {
    if (!req.headers.get("authorization")) throw new HttpError(401, "missing_token", "Sign-in required");
    return "uid-a";
  }),
}));
const deleteUserEvents = vi.fn(async () => 2);
vi.mock("../../netlify/functions/_shared/eventKeys.js", () => ({ deleteUserEvents: (...a) => deleteUserEvents(...a) }));
vi.mock("@netlify/blobs", () => ({ getStore: () => ({ name: "events" }) }));

const { default: handler } = await import("../../netlify/functions/delete-my-events.js");
const call = (headers = { Authorization: "Bearer t" }, method = "POST") =>
  handler(new Request("http://localhost/api/delete-my-events", { method, headers }));

beforeEach(() => deleteUserEvents.mockClear());

// CRITICAL_REVIEW.md §41ב: "delete account" also deletes the usage events.
describe("delete-my-events", () => {
  it("deletes the signed-in user's own events", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, deleted: 2 });
    expect(deleteUserEvents).toHaveBeenCalledWith({ name: "events" }, "uid-a");
  });

  it("refuses without sign-in and on other methods", async () => {
    expect((await call({})).status).toBe(401);
    expect((await call(undefined, "GET")).status).toBe(405);
    expect(deleteUserEvents).not.toHaveBeenCalled();
  });
});
