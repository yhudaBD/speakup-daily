import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/services/firebase", () => ({ auth: null }));
const { aiService } = await import("../../src/services/ai.service");

const fetchMock = vi.fn();
const groqReply = (content) =>
  new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) }, finish_reason: "stop" }] }), {
    status: 200,
  });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const conversation = [
  { role: "assistant", content: "Hi! What can I get you?" },
  { role: "user", content: "A coffee please" },
];

describe("analyzeConversation", () => {
  it("rejects instead of inventing a score when the AI is unavailable", async () => {
    fetchMock.mockResolvedValue(new Response("upstream down", { status: 502 }));
    await expect(aiService.analyzeConversation({ messages: conversation, topicTitle: "Café" })).rejects.toThrow();
  });

  it("refuses to analyze a conversation with no user messages", async () => {
    await expect(
      aiService.analyzeConversation({ messages: [conversation[0]], topicTitle: "Café" }),
    ).rejects.toThrow(/no user messages/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("normalizes a valid analysis and clamps the score", async () => {
    fetchMock.mockResolvedValue(groqReply({
      overall_score: "140", summary: "טוב", strengths: ["a", 5, ""], improvements: "not a list",
    }));
    const result = await aiService.analyzeConversation({ messages: conversation, topicTitle: "Café" });
    expect(result).toEqual({
      overall_score: 100, summary: "טוב", strengths: ["a"], improvements: [], grammar_notes: [], vocabulary_suggestions: [],
    });
  });

  it("retries a reply that doesn't fit the schema, then gives up", async () => {
    fetchMock.mockImplementation(async () => groqReply({ summary: "x" }));
    await expect(aiService.analyzeConversation({ messages: conversation, topicTitle: "Café" })).rejects.toThrow(/schema_invalid/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("succeeds when a retry returns a valid reply", async () => {
    fetchMock
      .mockResolvedValueOnce(groqReply({ summary: "x" }))
      .mockResolvedValueOnce(groqReply({ overall_score: 70, summary: "טוב" }));
    const result = await aiService.analyzeConversation({ messages: conversation, topicTitle: "Café" });
    expect(result.overall_score).toBe(70);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("analyzePracticeSession", () => {
  const args = { sentences: [{ text: "Let me tell you about that." }], categoryLabel: "Work", difficulty: "easy", averageScore: 80 };

  it("rejects instead of inventing vocabulary when the AI is unavailable", async () => {
    fetchMock.mockResolvedValue(new Response("upstream down", { status: 502 }));
    await expect(aiService.analyzePracticeSession(args)).rejects.toThrow();
  });

  it("drops vocabulary entries without a word", async () => {
    fetchMock.mockResolvedValue(groqReply({
      summary_he: "סיכום", speaking_tips: ["tip"], vocabulary: [{ word: " tell " }, { meaning_he: "x" }, null],
    }));
    const result = await aiService.analyzePracticeSession(args);
    expect(result.vocabulary).toEqual([{ word: "tell", meaning_he: "", usage_tip_he: "", example: "" }]);
  });
});

describe("generatePracticeSentences", () => {
  it("rejects instead of returning canned sentences", async () => {
    fetchMock.mockResolvedValue(new Response("upstream down", { status: 502 }));
    await expect(aiService.generatePracticeSentences({ topic: "בשדה התעופה" })).rejects.toThrow();
  });

  it("rejects a response with no usable sentences after retrying", async () => {
    fetchMock.mockImplementation(async () => groqReply({ topic_en: "Airport", sentences: [{ translation: "x" }] }));
    await expect(aiService.generatePracticeSentences({ topic: "בשדה התעופה" })).rejects.toThrow(/no usable sentences/);
  });

  it("returns cleaned sentences", async () => {
    fetchMock.mockResolvedValue(groqReply({ topic_en: "Airport", sentences: [{ text: " Where is gate 5? ", translation: "איפה שער 5?" }] }));
    const { sentences, topicEn } = await aiService.generatePracticeSentences({ topic: "בשדה התעופה", difficulty: "easy" });
    expect(topicEn).toBe("Airport");
    expect(sentences).toEqual([{
      id: "ai_001", text: "Where is gate 5?", translation: "איפה שער 5?", category: "ai", difficulty: "easy", phonetic_tips: "",
    }]);
  });
});

describe("runPlacementTurn", () => {
  it("returns a normalized final result", async () => {
    fetchMock.mockResolvedValue(groqReply({
      phase: "complete", ai_reply: "Great chat!", ai_reply_he: "",
      result: { overall_level: "B1 (usually the lower)", learning_plan: [{ title_he: "א", focus_en: "b" }] },
    }));
    const turn = await aiService.runPlacementTurn({ messages: [{ role: "user", content: "hi" }] });
    expect(turn.phase).toBe("complete");
    expect(turn.result.overall_level).toBe("B1");
  });
});

describe("request timeouts and cancellation", () => {
  // Never answers; rejects with the abort reason, like a real fetch
  // (immediately, if the signal is already aborted when it's called).
  const hangingFetch = (_url, { signal }) =>
    new Promise((_, reject) => {
      if (signal.aborted) return reject(signal.reason);
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    });

  it("rejects with AbortError when the caller cancels, without retrying", async () => {
    fetchMock.mockImplementation(hangingFetch);
    const controller = new AbortController();
    const pending = aiService.analyzeConversation({ messages: conversation, topicTitle: "Café", signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives up on a stalled request after 30 seconds", async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockImplementation(hangingFetch);
      const pending = aiService.runPlacementTurn({ messages: [{ role: "user", content: "hi" }] });
      const assertion = expect(pending).rejects.toMatchObject({ name: "TimeoutError" });
      await vi.advanceTimersByTimeAsync(30_000);
      await assertion;
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not answer a cancelled chat turn with the canned fallback", async () => {
    fetchMock.mockImplementation(hangingFetch);
    const controller = new AbortController();
    const pending = aiService.sendMessage({ systemPrompt: "x", messages: [], signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("times out a stalled transcription too", async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockImplementation(hangingFetch);
      const pending = aiService.transcribeAudio(new Blob(["abc"], { type: "audio/webm" }));
      const assertion = expect(pending).rejects.toMatchObject({ name: "TimeoutError" });
      await vi.advanceTimersByTimeAsync(30_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
