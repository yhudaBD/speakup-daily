import { describe, expect, it } from "vitest";
import {
  chatTurnSchema,
  conversationAnalysisSchema,
  wordHelpSchema,
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
      hint_he: "",
      starter: "",
      suggested_user_responses: [{ en: "Hello", hint: "" }, { en: "I'd like tea", hint: "polite" }],
    });
  });

  it("requires a reply", () => {
    expect(chatTurnSchema.safeParse({ ai_reply: "  " }).success).toBe(false);
    expect(chatTurnSchema.safeParse({}).success).toBe(false);
  });

  // CRITICAL_REVIEW.md §5: the hint ladder's first two steps.
  it("keeps the Hebrew idea and the opening words of a reply", () => {
    const out = chatTurnSchema.parse({ ai_reply: "Hi", hint_he: " ספר מה אתה רוצה ", starter: "I'd like " });
    expect(out).toMatchObject({ hint_he: "ספר מה אתה רוצה", starter: "I'd like" });
    expect(chatTurnSchema.parse({ ai_reply: "Hi", hint_he: 5 })).toMatchObject({ hint_he: "", starter: "" });
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

// CRITICAL_REVIEW.md §14: the model gives a 1-5 rubric and the score is
// computed from it in code, not a number the model "feels".
describe("conversationAnalysisSchema", () => {
  it("computes the score from the rubric, ignoring the model's own, and filters lists", () => {
    expect(conversationAnalysisSchema.parse({
      overall_score: 99, rubric: { fluency: 4, grammar: "3", vocabulary: 5 },
      summary: "טוב", strengths: ["a", 5, ""], improvements: "not a list",
    })).toEqual({
      rubric: { fluency: 4, grammar: 3, vocabulary: 5 }, overall_score: 75,
      summary: "טוב", strengths: ["a"], improvements: [], grammar_notes: [], vocabulary_suggestions: [],
    });
  });

  it("maps the rubric's range onto 0-100 and clamps each part to 1-5", () => {
    const score = (rubric) => conversationAnalysisSchema.parse({ rubric, summary: "x" }).overall_score;
    expect(score({ fluency: 1, grammar: 1, vocabulary: 1 })).toBe(0);
    expect(score({ fluency: 5, grammar: 5, vocabulary: 5 })).toBe(100);
    expect(score({ fluency: 9, grammar: 0, vocabulary: 3.4 })).toBe(50);
  });

  it("rejects a missing or partial rubric instead of guessing", () => {
    expect(conversationAnalysisSchema.safeParse({ summary: "x", overall_score: 80 }).success).toBe(false);
    expect(conversationAnalysisSchema.safeParse({ summary: "x", rubric: { fluency: 3, grammar: 3 } }).success).toBe(false);
    expect(conversationAnalysisSchema.safeParse({ summary: "x", rubric: { fluency: null, grammar: 3, vocabulary: 3 } }).success).toBe(false);
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

describe("wordHelpSchema", () => {
  it("needs a tip and fills the rest", () => {
    expect(wordHelpSchema.parse({ tip_he: " תגיד a " })).toEqual({ say_he: "", tip_he: "תגיד a", meaning_he: "" });
    expect(wordHelpSchema.safeParse({ say_he: "x" }).success).toBe(false);
  });
});
