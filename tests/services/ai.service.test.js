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
  // CRITICAL_REVIEW.md §5 fix #3: the model is told which turns the user
  // didn't write, and not to score them.
  it("marks turns read from a suggestion or a translation in the transcript", async () => {
    fetchMock.mockResolvedValue(groqReply({ rubric: { fluency: 3, grammar: 3, vocabulary: 3 }, summary: "טוב" }));
    await aiService.analyzeConversation({
      topicTitle: "Café",
      messages: [
        { role: "assistant", content: "Hi!" },
        { role: "user", content: "A coffee", source: "spoken" },
        { role: "user", content: "With milk", source: "typed" },
        { role: "user", content: "I would like a cake", source: "suggestion" },
        { role: "user", content: "Where is the toilet?", source: "translated" },
        { role: "user", content: "Old turn" },
      ],
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const [system, user] = body.messages;
    expect(user.content).toContain("AI: Hi!\nStudent: A coffee\nStudent: With milk\n"
      + "Student (read a suggestion): I would like a cake\nStudent (used a translation): Where is the toilet?\nStudent: Old turn");
    expect(system.content).toMatch(/read a suggestion.*used a translation/s);
  });

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

  it("normalizes a valid analysis and computes the score from the rubric", async () => {
    fetchMock.mockResolvedValue(groqReply({
      rubric: { fluency: 5, grammar: 5, vocabulary: 5 }, summary: "טוב", strengths: ["a", 5, ""], improvements: "not a list",
    }));
    const result = await aiService.analyzeConversation({ messages: conversation, topicTitle: "Café" });
    expect(result).toEqual({
      rubric: { fluency: 5, grammar: 5, vocabulary: 5 }, overall_score: 100,
      summary: "טוב", strengths: ["a"], improvements: [], grammar_notes: [], vocabulary_suggestions: [],
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
      .mockResolvedValueOnce(groqReply({ rubric: { fluency: 4, grammar: 3, vocabulary: 4 }, summary: "טוב" }));
    const result = await aiService.analyzeConversation({ messages: conversation, topicTitle: "Café" });
    expect(result.overall_score).toBe(67);
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

describe("sendMessage", () => {
  const args = { systemPrompt: "You are a barista.", messages: [{ role: "user", content: "Hi" }] };

  it("rejects instead of returning a canned reply when the chat call fails", async () => {
    fetchMock.mockResolvedValue(new Response("upstream down", { status: 502 }));
    await expect(aiService.sendMessage(args)).rejects.toThrow();
  });

  it("still returns the reply when only the Hebrew translation fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchMock
      .mockResolvedValueOnce(groqReply({ ai_reply: "Hello!", suggested_user_responses: ["Hi there"] }))
      .mockResolvedValueOnce(new Response("upstream down", { status: 502 }));
    const out = await aiService.sendMessage(args);
    expect(out).toEqual({
      ai_reply: "Hello!",
      ai_reply_he: "",
      hint_he: "",
      starter: "",
      suggested_user_responses: [{ en: "Hi there", he: "", hint: "" }],
    });
    warn.mockRestore();
  });

  it("lines up translations with the reply and each suggestion", async () => {
    fetchMock
      .mockResolvedValueOnce(groqReply({ ai_reply: "Hello!", suggested_user_responses: ["Hi", "Hey"] }))
      .mockResolvedValueOnce(groqReply({ translations: ["שלום!", "היי", "הי"] }));
    const out = await aiService.sendMessage(args);
    expect(out.ai_reply_he).toBe("שלום!");
    expect(out.suggested_user_responses.map((s) => s.he)).toEqual(["היי", "הי"]);
  });
});


// CRITICAL_REVIEW.md §26א: the proxy refuses accounts outside the beta list
// with 403 not_in_beta, and the app says so instead of a generic failure.
describe("beta access", () => {
  it("announces not_in_beta once and still rejects the call", async () => {
    const { isNotInBeta, onNotInBeta } = await import("../../src/services/betaAccess");
    const listener = vi.fn();
    const unsubscribe = onNotInBeta(listener);
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "not_in_beta", message: "beta only" } }), { status: 403 }),
    );

    await expect(aiService.analyzeConversation({ messages: conversation, topicTitle: "Café" })).rejects.toThrow(/403/);
    expect(isNotInBeta()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("doesn't treat other 403s as a beta refusal", async () => {
    vi.resetModules();
    vi.doMock("../../src/services/firebase", () => ({ auth: null }));
    const { aiService: fresh } = await import("../../src/services/ai.service");
    const { isNotInBeta } = await import("../../src/services/betaAccess");
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: { code: "forbidden" } }), { status: 403 }));

    await expect(fresh.analyzeConversation({ messages: conversation, topicTitle: "Café" })).rejects.toThrow(/403/);
    expect(isNotInBeta()).toBe(false);
  });
});

// CRITICAL_REVIEW.md §5: the hint ladder gets a Hebrew idea and opening words
// with every reply, and nothing in hard mode.
describe("sendMessage hints", () => {
  const args = { systemPrompt: "You are a barista.", messages: [{ role: "user", content: "Hi" }] };

  it("returns the Hebrew idea and the opening words", async () => {
    fetchMock
      .mockResolvedValueOnce(groqReply({ ai_reply: "Hello!", hint_he: "תזמין שתייה", starter: "Can I get", suggested_user_responses: ["Can I get a tea?"] }))
      .mockResolvedValueOnce(groqReply({ translations: ["שלום!", "אפשר לקבל תה?"] }));
    const out = await aiService.sendMessage(args);
    expect(out).toMatchObject({ hint_he: "תזמין שתייה", starter: "Can I get" });
  });

  it("gives no help in hard mode", async () => {
    fetchMock
      .mockResolvedValueOnce(groqReply({ ai_reply: "Hello!", hint_he: "תזמין שתייה", starter: "Can I get", suggested_user_responses: ["Can I get a tea?"] }))
      .mockResolvedValueOnce(groqReply({ translations: ["שלום!"] }));
    const out = await aiService.sendMessage({ ...args, chatDifficulty: "hard" });
    expect(out).toMatchObject({ hint_he: "", starter: "", suggested_user_responses: [] });
  });
});

// CRITICAL_REVIEW.md §17: the conversation partner speaks natural English,
// contractions included. Easy mode asks for simple words instead.
describe("conversation prompt style", () => {
  const sentPrompt = async (chatDifficulty) => {
    fetchMock
      .mockResolvedValueOnce(groqReply({ ai_reply: "Hi!", suggested_user_responses: [] }))
      .mockResolvedValueOnce(groqReply({ translations: ["היי!"] }));
    await aiService.sendMessage({ systemPrompt: "You are a barista.", messages: [{ role: "user", content: "Hi" }], chatDifficulty });
    return JSON.parse(fetchMock.mock.calls.at(-2)[1].body).messages[0].content;
  };

  it.each(["easy", "medium", "hard"])("doesn't forbid contractions (%s)", async (difficulty) => {
    const prompt = await sentPrompt(difficulty);
    expect(prompt).not.toMatch(/contraction|full forms|full words/i);
  });

  it("asks for simple words in easy mode", async () => {
    expect(await sentPrompt("easy")).toMatch(/prefer simple words/i);
  });
});
