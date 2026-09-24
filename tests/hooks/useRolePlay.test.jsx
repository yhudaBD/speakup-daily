// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";

vi.mock("../../src/services/ai.service", () => ({
  aiService: { sendMessage: vi.fn() },
  isAbortError: (err) => err?.name === "AbortError",
}));
vi.mock("../../src/utils/speechVoice", () => ({
  speakNaturally: vi.fn(),
  getBestEnglishVoice: vi.fn(),
  preloadVoices: vi.fn(),
}));
vi.mock("../../src/utils/analytics", () => ({ logEvent: vi.fn() }));

const { aiService } = await import("../../src/services/ai.service");
const { useRolePlay } = await import("../../src/hooks/useRolePlay");

const topic = { id: "cafe", emoji: "☕", title: "Café", description: "", difficulty: "easy", systemPrompt: "You are a barista." };
const reply = (text) => ({ ai_reply: text, ai_reply_he: "", suggested_user_responses: [] });

// A sendMessage call that stays pending until resolved, or rejects when its
// signal aborts, like the real one.
function deferredCall() {
  let resolve;
  const calls = [];
  aiService.sendMessage.mockImplementationOnce(({ signal }) =>
    new Promise((res, reject) => {
      resolve = res;
      calls.push(signal);
      signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }),
  );
  return { resolve: (v) => resolve(v), signal: () => calls[0] };
}

let persisted;
function renderRolePlay(initialProps) {
  return renderHook((props) => useRolePlay({ topic, onPersist: (chat) => persisted.push(chat), ...props }), { initialProps });
}

beforeEach(() => {
  persisted = [];
  aiService.sendMessage.mockReset();
  window.speechSynthesis = { cancel: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() };
});
afterEach(() => {
  cleanup();
  delete window.speechSynthesis;
});

describe("useRolePlay", () => {
  it("drops a reply that arrives after the user switched to a new chat", async () => {
    aiService.sendMessage.mockResolvedValueOnce(reply("A: welcome"));
    const { result, rerender } = renderRolePlay({ sessionId: "chat_a", savedChat: null });
    await waitFor(() => expect(result.current.phase).toBe("USER_TURN"));

    const slow = deferredCall();
    act(() => { result.current.handleUserMessage("A coffee please"); });
    await waitFor(() => expect(result.current.phase).toBe("AI_THINKING"));

    aiService.sendMessage.mockResolvedValueOnce(reply("B: hello"));
    rerender({ sessionId: "chat_b", savedChat: null });
    await waitFor(() => expect(result.current.messages.map((m) => m.content)).toEqual(["B: hello"]));

    expect(slow.signal().aborted).toBe(true);
    await act(async () => slow.resolve(reply("A: late answer")));

    expect(result.current.messages.map((m) => m.content)).toEqual(["B: hello"]);
    const everything = JSON.stringify(persisted);
    expect(everything).not.toContain("A: late answer");
    // Chat A's record never picks up chat B's messages.
    for (const chat of persisted.filter((c) => c.id === "chat_a")) {
      expect(JSON.stringify(chat.messages)).not.toContain("B: hello");
    }
  });

  it("asks for the missing reply when resuming a chat that ends with the user's message", async () => {
    aiService.sendMessage.mockResolvedValueOnce(reply("Sure, one coffee."));
    const savedChat = {
      id: "chat_a",
      status: "active",
      turnCount: 0, // saved before the turn was counted
      messages: [
        { role: "assistant", content: "What can I get you?" },
        { role: "user", content: "A coffee please" },
      ],
    };
    const { result } = renderRolePlay({ sessionId: "chat_a", savedChat });

    await waitFor(() => expect(result.current.phase).toBe("USER_TURN"));
    expect(aiService.sendMessage).toHaveBeenCalledTimes(1);
    expect(aiService.sendMessage.mock.calls[0][0].messages.at(-1)).toEqual({ role: "user", content: "A coffee please" });
    expect(result.current.messages.at(-1).content).toBe("Sure, one coffee.");
    expect(result.current.turnCount).toBe(1);
  });

  it("resumes a chat that ends with the AI's message without calling the AI", async () => {
    const savedChat = {
      id: "chat_a", status: "active", turnCount: 1,
      messages: [{ role: "user", content: "Hi" }, { role: "assistant", content: "Hello!" }],
    };
    const { result } = renderRolePlay({ sessionId: "chat_a", savedChat });
    await waitFor(() => expect(result.current.phase).toBe("USER_TURN"));
    expect(aiService.sendMessage).not.toHaveBeenCalled();
  });
});
