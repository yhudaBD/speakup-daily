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
const { logEvent } = await import("../../src/utils/analytics");

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

  it("shows a failed reply as REPLY_FAILED without inventing a message, and retry fetches it", async () => {
    aiService.sendMessage.mockResolvedValueOnce(reply("What can I get you?"));
    const { result } = renderRolePlay({ sessionId: "chat_a", savedChat: null });
    await waitFor(() => expect(result.current.phase).toBe("USER_TURN"));

    aiService.sendMessage.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await act(async () => { await result.current.handleUserMessage("A coffee please"); });

    expect(result.current.phase).toBe("REPLY_FAILED");
    expect(result.current.messages.map((m) => m.content)).toEqual(["What can I get you?", "A coffee please"]);

    aiService.sendMessage.mockResolvedValueOnce(reply("Coming right up."));
    await act(async () => { result.current.retryReply(); });
    await waitFor(() => expect(result.current.phase).toBe("USER_TURN"));
    expect(result.current.messages.at(-1).content).toBe("Coming right up.");
    expect(aiService.sendMessage.mock.calls.at(-1)[0].messages.at(-1)).toEqual({ role: "user", content: "A coffee please" });
    error.mockRestore();
  });

  it("retries a failed opening line", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    aiService.sendMessage.mockRejectedValueOnce(new DOMException("timed out", "TimeoutError"));
    const { result } = renderRolePlay({ sessionId: "chat_a", savedChat: null });
    await waitFor(() => expect(result.current.phase).toBe("REPLY_FAILED"));
    expect(result.current.messages).toEqual([]);

    aiService.sendMessage.mockResolvedValueOnce(reply("Welcome in!"));
    await act(async () => { result.current.retryReply(); });
    await waitFor(() => expect(result.current.phase).toBe("USER_TURN"));
    expect(result.current.messages.map((m) => m.content)).toEqual(["Welcome in!"]);
    error.mockRestore();
  });
});

// T4 in ACTION_PLAN.md: each user turn records how it was made, and the
// session reports its independent speaking time (never the content).
describe("speaking source and time (T4)", () => {

  it("stores the turn's source and duration, and sends the AI only role and content", async () => {
    aiService.sendMessage.mockResolvedValueOnce(reply("What can I get you?"));
    const { result } = renderRolePlay({ sessionId: "chat_a", savedChat: null });
    await waitFor(() => expect(result.current.phase).toBe("USER_TURN"));

    aiService.sendMessage.mockResolvedValueOnce(reply("Sure."));
    await act(async () => { await result.current.handleUserMessage("A coffee please", { source: "spoken", durationMs: 2300 }); });
    await waitFor(() => expect(result.current.phase).toBe("USER_TURN"));

    expect(persisted.at(-1).messages[1]).toMatchObject({ role: "user", content: "A coffee please", source: "spoken", durationMs: 2300 });
    expect(aiService.sendMessage.mock.calls.at(-1)[0].messages.at(-1)).toEqual({ role: "user", content: "A coffee please" });
  });

  it("marks a turn typed when no source is given, and drops a duration on anything but speech", async () => {
    aiService.sendMessage.mockResolvedValueOnce(reply("Hi"));
    const { result } = renderRolePlay({ sessionId: "chat_a", savedChat: null });
    await waitFor(() => expect(result.current.phase).toBe("USER_TURN"));

    aiService.sendMessage.mockResolvedValueOnce(reply("Ok"));
    await act(async () => { await result.current.handleUserMessage("Hello"); });
    await waitFor(() => expect(result.current.phase).toBe("USER_TURN"));
    aiService.sendMessage.mockResolvedValueOnce(reply("Ok"));
    await act(async () => { await result.current.handleUserMessage("Tea", { source: "suggestion", durationMs: 999 }); });
    await waitFor(() => expect(result.current.phase).toBe("USER_TURN"));

    const userTurns = persisted.at(-1).messages.filter((m) => m.role === "user");
    expect(userTurns[0]).toEqual({ role: "user", content: "Hello", source: "typed" });
    expect(userTurns[1]).toEqual({ role: "user", content: "Tea", source: "suggestion" });
  });

  it("reports the session's independent speaking time when it ends", async () => {
    logEvent.mockClear();
    aiService.sendMessage.mockResolvedValueOnce(reply("Hi"));
    const { result } = renderRolePlay({ sessionId: "chat_a", savedChat: null, userId: "user_1", onSessionComplete: vi.fn() });
    await waitFor(() => expect(result.current.phase).toBe("USER_TURN"));

    aiService.sendMessage.mockResolvedValueOnce(reply("Ok"));
    await act(async () => { await result.current.handleUserMessage("I want a coffee", { source: "spoken", durationMs: 2600 }); });
    await waitFor(() => expect(result.current.phase).toBe("USER_TURN"));
    aiService.sendMessage.mockResolvedValueOnce(reply("Ok"));
    await act(async () => { await result.current.handleUserMessage("Large", { source: "typed" }); });
    await waitFor(() => expect(result.current.phase).toBe("USER_TURN"));

    act(() => { result.current.endConversation(); });
    expect(logEvent).toHaveBeenCalledWith("user_1", "speaking_time", { kind: "roleplay", independent_sec: 3, repeat_sec: 0 });
  });

  it("sends no speaking time when nothing was said out loud", async () => {
    logEvent.mockClear();
    aiService.sendMessage.mockResolvedValueOnce(reply("Hi"));
    const { result } = renderRolePlay({ sessionId: "chat_a", savedChat: null, userId: "user_1", onSessionComplete: vi.fn() });
    await waitFor(() => expect(result.current.phase).toBe("USER_TURN"));
    act(() => { result.current.endConversation(); });
    expect(logEvent).not.toHaveBeenCalledWith("user_1", "speaking_time", expect.anything());
  });
});

// CRITICAL_REVIEW.md §3 / ACTION_PLAN.md D1: a conversation makes the day
// active only with a turn of the user's own.
describe("session record", () => {
  it("counts the turns the user made themselves", async () => {
    const onSessionComplete = vi.fn();
    aiService.sendMessage.mockResolvedValueOnce(reply("Hi"));
    const { result } = renderRolePlay({ sessionId: "chat_a", savedChat: null, onSessionComplete });
    await waitFor(() => expect(result.current.phase).toBe("USER_TURN"));
    for (const [text, source] of [["Coffee", "spoken"], ["Tea", "suggestion"], ["Cake", "typed"]]) {
      aiService.sendMessage.mockResolvedValueOnce(reply("Ok"));
      await act(async () => { await result.current.handleUserMessage(text, { source, durationMs: 1000 }); });
      await waitFor(() => expect(result.current.phase).toBe("USER_TURN"));
    }
    act(() => { result.current.endConversation(); });
    expect(onSessionComplete).toHaveBeenCalledWith(expect.objectContaining({ turnCount: 3, ownTurnCount: 2 }));
  });
});

// CRITICAL_REVIEW.md §16: a conversation ended before 3 turns of the user is
// saved as abandoned, and doesn't count as a finished one.
describe("short conversations", () => {
  it("marks a conversation with fewer than 3 user turns abandoned", async () => {
    const onSessionComplete = vi.fn();
    aiService.sendMessage.mockResolvedValueOnce(reply("Hi"));
    const { result } = renderRolePlay({ sessionId: "chat_a", savedChat: null, onSessionComplete });
    await waitFor(() => expect(result.current.phase).toBe("USER_TURN"));
    aiService.sendMessage.mockResolvedValueOnce(reply("Ok"));
    await act(async () => { await result.current.handleUserMessage("Coffee", { source: "typed" }); });
    await waitFor(() => expect(result.current.phase).toBe("USER_TURN"));
    act(() => { result.current.endConversation(); });
    expect(onSessionComplete).toHaveBeenCalledWith(expect.objectContaining({ turnCount: 1, status: "abandoned" }));
  });

  it("marks a conversation with 3 user turns completed", async () => {
    const onSessionComplete = vi.fn();
    aiService.sendMessage.mockResolvedValueOnce(reply("Hi"));
    const { result } = renderRolePlay({ sessionId: "chat_a", savedChat: null, onSessionComplete });
    await waitFor(() => expect(result.current.phase).toBe("USER_TURN"));
    for (const text of ["Coffee", "Tea", "Cake"]) {
      aiService.sendMessage.mockResolvedValueOnce(reply("Ok"));
      await act(async () => { await result.current.handleUserMessage(text, { source: "typed" }); });
      await waitFor(() => expect(result.current.phase).toBe("USER_TURN"));
    }
    act(() => { result.current.endConversation(); });
    expect(onSessionComplete).toHaveBeenCalledWith(expect.objectContaining({ turnCount: 3, status: "completed" }));
  });
});

// CRITICAL_REVIEW.md §30: the 10th turn used to end the conversation at
// once, leaving the user's last message unanswered.
describe("the last turn", () => {
  async function talkTo(turns, onSessionComplete) {
    aiService.sendMessage.mockResolvedValueOnce(reply("Hi"));
    const hook = renderRolePlay({ sessionId: "chat_a", savedChat: null, onSessionComplete });
    await waitFor(() => expect(hook.result.current.phase).toBe("USER_TURN"));
    for (let i = 1; i < turns; i++) {
      aiService.sendMessage.mockResolvedValueOnce(reply(`Answer ${i}`));
      await act(async () => { await hook.result.current.handleUserMessage(`Turn ${i}`, { source: "typed" }); });
      await waitFor(() => expect(hook.result.current.phase).toBe("USER_TURN"));
    }
    return hook;
  }

  it("gets a closing reply from the character before the conversation ends", async () => {
    const onSessionComplete = vi.fn();
    const { result } = await talkTo(10, onSessionComplete);
    aiService.sendMessage.mockResolvedValueOnce({ ...reply("Enjoy your coffee, see you!"), hint_he: "x", starter: "y" });
    await act(async () => { await result.current.handleUserMessage("Thanks, bye!", { source: "typed" }); });

    await waitFor(() => expect(result.current.phase).toBe("DONE"));
    const last = aiService.sendMessage.mock.calls.at(-1)[0];
    expect(last.systemPrompt).toMatch(/last turn.*wrap up/is);
    expect(result.current.messages.at(-1)).toMatchObject({ role: "assistant", content: "Enjoy your coffee, see you!" });
    expect(result.current.turnHelp).toBeNull();
    expect(onSessionComplete).toHaveBeenCalledWith(expect.objectContaining({ turnCount: 10 }));
    expect(persisted.at(-1)).toMatchObject({ status: "completed", turnCount: 10 });
  });

  it("offers a retry when the closing reply fails, and ends after it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onSessionComplete = vi.fn();
    const { result } = await talkTo(10, onSessionComplete);
    aiService.sendMessage.mockRejectedValueOnce(new Error("down"));
    await act(async () => { await result.current.handleUserMessage("Thanks, bye!", { source: "typed" }); });
    expect(result.current.phase).toBe("REPLY_FAILED");
    expect(onSessionComplete).not.toHaveBeenCalled();

    aiService.sendMessage.mockResolvedValueOnce(reply("Bye!"));
    await act(async () => { await result.current.retryReply(); });
    await waitFor(() => expect(result.current.phase).toBe("DONE"));
    expect(onSessionComplete).toHaveBeenCalledTimes(1);
  });
});
