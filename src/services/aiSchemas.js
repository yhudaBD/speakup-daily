// Schemas for every JSON response the AI returns. groqChat() (ai.service.js)
// parses and checks each response against one of these. A response that
// doesn't fit is retried like Groq's own JSON-mode failures, and gives up
// with an error after the last attempt. Nothing half-formed reaches state:
// these values drive the level auto-adjust, the placement gaps quoted in
// later prompts, the word bank and the learning plan.
//
// The schemas lean toward repairing rather than rejecting. Optional lists
// drop bad items instead of failing the whole response, and scores and
// levels are coerced into range. They only fail when the part a feature
// can't do without is missing.
//
// zod/mini, not classic zod: the same engine with a functional API, at
// roughly a third of the bundle cost (classic zod added ~25KB gzipped to the
// only JS chunk). In zod 4 every object key is required unless wrapped in
// z.optional(), even z.unknown(), and the model often just omits optional
// fields, hence `loose()` below.
import * as z from "zod/mini";

export const CEFR_LEVELS = ["Pre-A1", "A1", "A2", "B1", "B2", "C1"];

// Any value, including a missing key, mapped through fn.
const loose = (fn) => z.pipe(z.optional(z.unknown()), z.transform(fn));

const requiredText = z.string().check(z.trim(), z.minLength(1));
const optionalText = loose((v) => (typeof v === "string" ? v.trim() : ""));
const textList = (max) =>
  loose((v) =>
    (Array.isArray(v) ? v : [])
      .filter((x) => typeof x === "string" && x.trim())
      .map((x) => x.trim())
      .slice(0, max),
  );
// Keep the valid items of an array and silently drop the rest.
const listOf = (item, max) =>
  loose((v) =>
    (Array.isArray(v) ? v : [])
      .map((x) => z.safeParse(item, x))
      .filter((r) => r.success)
      .map((r) => r.data)
      .slice(0, max),
  );
const nonEmpty = (message) => z.refine((list) => list.length > 0, message);

// "A1 (usually the lower)" or "b1+" → "A1" / "B1". C2 folds into C1, the top
// level the app models. Anything without a recognizable level is undefined.
export function toCefr(value) {
  if (typeof value !== "string") return undefined;
  const match = /\b(pre-a1|a1|a2|b1|b2|c1|c2)\b/i.exec(value);
  if (!match) return undefined;
  const level = match[1].toUpperCase().replace("PRE-A1", "Pre-A1");
  return level === "C2" ? "C1" : level;
}
const cefr = loose(toCefr);
const requiredCefr = cefr.check(z.refine((v) => v !== undefined, "no CEFR level"));

// "75" and 75 both work. null, missing or non-numeric fail rather than
// quietly becoming 0. z.number() also rejects NaN and Infinity.
const score = z.pipe(
  z.pipe(z.unknown(), z.transform((v) => (typeof v === "string" && v.trim() !== "" ? Number(v) : v))),
  z.pipe(z.number(), z.transform((n) => Math.round(Math.min(100, Math.max(0, n))))),
);

const suggestion = z.union([
  z.pipe(requiredText, z.transform((en) => ({ en, hint: "" }))),
  z.object({ en: requiredText, hint: optionalText }),
]);

export const chatTurnSchema = z.object({
  ai_reply: requiredText,
  suggested_user_responses: listOf(suggestion, 5),
});

export const translationSchema = z.object({
  translations: z.pipe(z.array(z.unknown()), z.transform((items) => items.map((t) => (typeof t === "string" ? t : "")))),
});

const planModule = z.object({
  title_he: requiredText,
  focus_en: requiredText,
  why_he: optionalText,
});

const placementResult = z.object({
  comprehension_level: cefr,
  speaking_level: cefr,
  overall_level: requiredCefr,
  job_field: optionalText,
  situations: textList(10),
  gaps: textList(20),
  summary_he: optionalText,
  learning_plan: listOf(planModule, 10),
});

export const placementTurnSchema = z.pipe(
  z.object({
    phase: z.optional(z.unknown()),
    ai_reply: optionalText,
    ai_reply_he: optionalText,
    result: z.optional(z.unknown()),
  }),
  z.transform((turn, ctx) => {
    if (turn.phase !== "complete") {
      if (!turn.ai_reply) ctx.issues.push({ code: "custom", message: "empty reply", input: turn });
      return { phase: "in_progress", ai_reply: turn.ai_reply, ai_reply_he: turn.ai_reply_he, result: null };
    }
    const result = z.safeParse(placementResult, turn.result);
    if (!result.success) {
      ctx.issues.push({ code: "custom", message: "incomplete placement result", input: turn.result });
      return z.NEVER;
    }
    return { phase: "complete", ai_reply: turn.ai_reply, ai_reply_he: turn.ai_reply_he, result: result.data };
  }),
);

export const conversationAnalysisSchema = z.object({
  overall_score: score,
  summary: requiredText,
  strengths: textList(8),
  improvements: textList(8),
  grammar_notes: textList(8),
  vocabulary_suggestions: textList(8),
});

export const practiceAnalysisSchema = z.object({
  summary_he: requiredText,
  speaking_tips: textList(8),
  vocabulary: listOf(
    z.object({ word: requiredText, meaning_he: optionalText, usage_tip_he: optionalText, example: optionalText }),
    8,
  ),
});

export const practiceSentencesSchema = z.object({
  topic_en: optionalText,
  sentences: listOf(
    z.object({
      id: optionalText,
      text: requiredText,
      translation: optionalText,
      phonetic_tips: optionalText,
    }),
    20,
  ).check(nonEmpty("no usable sentences")),
});
