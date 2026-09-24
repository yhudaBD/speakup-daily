import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "../../netlify/functions/_shared/http.js";

vi.mock("../../netlify/functions/_shared/auth.js", () => ({
  requireUser: vi.fn(async (req) => {
    if (!req.headers.get("authorization")) throw new HttpError(401, "missing_token", "Sign-in required");
    return "uid-1";
  }),
}));
vi.mock("../../netlify/functions/_shared/quota.js", () => ({
  consumeDailyQuota: vi.fn(async () => undefined),
}));

const { default: handler } = await import("../../netlify/functions/groq-proxy.js");
const { consumeDailyQuota } = await import("../../netlify/functions/_shared/quota.js");

const fetchMock = vi.fn();

beforeEach(() => {
  process.env.GROQ_API_KEY = "test-key";
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ choices: [] }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function call(body, { token = "t", method = "POST" } = {}) {
  return handler(new Request("http://localhost/api/groq-proxy", {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: method === "POST" ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
  }));
}

const validChat = {
  type: "chat",
  model: "openai/gpt-oss-20b",
  messages: [{ role: "system", content: "You are helpful" }, { role: "user", content: "Hi" }],
  temperature: 0.5,
};

describe("groq-proxy", () => {
  it("rejects calls without a sign-in token", async () => {
    const res = await call(validChat, { token: null });
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects non-POST methods", async () => {
    expect((await call(null, { method: "GET" })).status).toBe(405);
  });

  it("refuses models outside the allowlist", async () => {
    const res = await call({ ...validChat, model: "llama-3.3-70b-versatile" });
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses malformed messages", async () => {
    expect((await call({ ...validChat, messages: [] })).status).toBe(400);
    expect((await call({ ...validChat, messages: [{ role: "tool", content: "x" }] })).status).toBe(400);
    expect((await call({ ...validChat, messages: [{ role: "user", content: "x".repeat(12_001) }] })).status).toBe(400);
  });

  it("refuses out-of-range temperature", async () => {
    expect((await call({ ...validChat, temperature: 5 })).status).toBe(400);
  });

  it("returns 413 for an oversized body", async () => {
    const res = await call({ type: "transcribe", audioBase64: "A".repeat(3_100_000), mimeType: "audio/webm" });
    expect(res.status).toBe(413);
  });

  it("refuses an unexpected audio mime type", async () => {
    const res = await call({ type: "transcribe", audioBase64: "AAAA", mimeType: "text/html" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid JSON and unknown types", async () => {
    expect((await call("{not json")).status).toBe(400);
    expect((await call({ type: "image" })).status).toBe(400);
  });

  it("forwards a valid chat with a server-side token cap and only the allowed fields", async () => {
    const res = await call({ ...validChat, messages: [{ role: "user", content: "Hi", extra: "dropped" }] });
    expect(res.status).toBe(200);
    expect(consumeDailyQuota).toHaveBeenCalledWith("uid-1");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(init.headers.Authorization).toBe("Bearer test-key");
    const sent = JSON.parse(init.body);
    expect(sent).toMatchObject({
      model: "openai/gpt-oss-20b",
      temperature: 0.5,
      max_completion_tokens: 8192,
      response_format: { type: "json_object" },
    });
    expect(sent.messages).toEqual([{ role: "user", content: "Hi" }]);
  });

  it("passes Groq's own error status and body through for the client's retry logic", async () => {
    const groqError = { error: { code: "json_validate_failed", message: "bad json" } };
    fetchMock.mockResolvedValue(new Response(JSON.stringify(groqError), { status: 400 }));
    const res = await call(validChat);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual(groqError);
  });

  it("returns 429 when the account's daily quota is used up", async () => {
    consumeDailyQuota.mockRejectedValueOnce(new HttpError(429, "daily_quota_exceeded", "limit"));
    const res = await call(validChat);
    expect(res.status).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps an unreachable upstream to 502", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    expect((await call(validChat)).status).toBe(502);
  });
});
