import { describe, expect, it } from "vitest";
import {
  chatTurnSchema,
  conversationAnalysisSchema,
  placementTurnSchema,
  practiceAnalysisSchema,
  practiceSentencesSchema,
  toCefr,
  translationSchema,
} from "../../src/services/aiSchemas";

describe("toCefr", () => {
  it("pulls the level out of annotated strings", () => {
    expect(toCefr("A1 (usually the lower)")).toBe("A1");
    expect(toCefr("b1+")).toBe("B1");
    expect(toCefr("pre-a1")).toBe("Pre-A1");
    expect(toCefr("C2")).toBe("C1");
  });

  it("returns undefined when there is no level", () => {
    expect(toCefr("intermediate")).toBeUndefined();
    expect(toCefr(3)).toBeUndefined();
  });
});

describe("chatTurnSchema", () => {
  it("normalizes suggestions given as strings or objects and drops broken ones", () => {
    const out = chatTurnSchema.parse({
      ai_reply: " Hi! ",
      suggested_user_responses: ["Hello", { en: "I'd like tea", hint: "polite" }, { hint: "no en" }, 7, ""],
    });
    expect(out).toEqual({
      ai_reply: "Hi!",
      suggested_user_responses: [{ en: "Hello", hint: "" }, { en: "I'd like tea", hint: "polite" }],
    });
  });

  it("requires a reply", () => {
    expect(chatTurnSchema.safeParse({ ai_reply: "  " }).success).toBe(false);
    expect(chatTurnSchema.safeParse({}).success).toBe(false);
  });

  it("treats missing suggestions as none", () => {
    expect(chatTurnSchema.parse({ ai_reply: "Hi" }).suggested_user_responses).toEqual([]);
  });
});

describe("translationSchema", () => {
  it("keeps positions, blanking non-strings", () => {
    expect(translationSchema.parse({ translations: ["שלום", null, "תודה"] }).translations).toEqual(["שלום", "", "תודה"]);
  });

  it("requires the translations array", () => {
    expect(translationSchema.safeParse({ text: "שלום" }).success).toBe(false);
  });
});

describe("placementTurnSchema", () => {
  it("passes an in-progress turn through", () => {
    expect(placementTurnSchema.parse({ phase: "in_progress", ai_reply: "Hi! What do you do?", ai_reply_he: "" })).toEqual({
      phase: "in_progress", ai_reply: "Hi! What do you do?", ai_reply_he: "", result: null,
    });
  });

  it("rejects an in-progress turn with no reply", () => {
    expect(placementTurnSchema.safeParse({ phase: "in_progress", ai_reply: "" }).success).toBe(false);
  });

  it("normalizes a final result", () => {
    const out = placementTurnSchema.parse({
      phase: "complete",
      ai_reply: "Great talking to you!",
      result: {
        comprehension_level: "A2", speaking_level: "A1", overall_level: "A1 (usually the lower)",
        job_field: "nurse", situations: ["patients", 3], gaps: ["past tense"], summary_he: "יופי",
        learning_plan: [{ title_he: "מודול", focus_en: "past tense", why_he: "כי" }, { title_he: "no focus" }],
      },
    });
    expect(out.phase).toBe("complete");
    expect(out.result).toMatchObject({
      overall_level: "A1", comprehension_level: "A2", situations: ["patients"],
      learning_plan: [{ title_he: "מודול", focus_en: "past tense", why_he: "כי" }],
    });
  });

  it("rejects a final turn without a usable overall level", () => {
    const turn = { phase: "complete", ai_reply: "Bye", result: { overall_level: "pretty good", learning_plan: [] } };
    expect(placementTurnSchema.safeParse(turn).success).toBe(false);
    expect(placementTurnSchema.safeParse({ phase: "complete", ai_reply: "Bye" }).success).toBe(false);
  });
});

describe("conversationAnalysisSchema", () => {
  it("clamps and coerces the score and filters lists", () => {
    expect(conversationAnalysisSchema.parse({
      overall_score: "140", summary: "טוב", strengths: ["a", 5, ""], improvements: "not a list",
    })).toEqual({
      overall_score: 100, summary: "טוב", strengths: ["a"], improvements: [], grammar_notes: [], vocabulary_suggestions: [],
    });
  });

  it("rejects a missing or null score instead of treating it as 0", () => {
    expect(conversationAnalysisSchema.safeParse({ summary: "x" }).success).toBe(false);
    expect(conversationAnalysisSchema.safeParse({ overall_score: null, summary: "x" }).success).toBe(false);
  });
});

describe("practice schemas", () => {
  it("drops vocabulary entries without a word", () => {
    const out = practiceAnalysisSchema.parse({
      summary_he: "סיכום", speaking_tips: ["tip"], vocabulary: [{ word: " tell " }, { meaning_he: "x" }, null],
    });
    expect(out.vocabulary).toEqual([{ word: "tell", meaning_he: "", usage_tip_he: "", example: "" }]);
  });

  it("requires at least one usable sentence", () => {
    expect(practiceSentencesSchema.safeParse({ sentences: [{ translation: "x" }] }).success).toBe(false);
    expect(practiceSentencesSchema.parse({ sentences: [{ text: " Hi " }] }).sentences[0].text).toBe("Hi");
  });
});
