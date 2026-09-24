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

  it("rejects an analysis without a usable score", async () => {
    fetchMock.mockResolvedValue(groqReply({ summary: "x" }));
    await expect(aiService.analyzeConversation({ messages: conversation, topicTitle: "Café" })).rejects.toThrow(/incomplete/);
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

  it("rejects a response with no usable sentences", async () => {
    fetchMock.mockResolvedValue(groqReply({ topic_en: "Airport", sentences: [{ translation: "x" }] }));
    await expect(aiService.generatePracticeSentences({ topic: "בשדה התעופה" })).rejects.toThrow(/no practice sentences/);
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
