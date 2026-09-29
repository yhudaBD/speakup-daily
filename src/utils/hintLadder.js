import { scorePronunciation } from "./pronunciationScorer";

// The hint ladder in a conversation (CRITICAL_REVIEW.md §5, IMPROVEMENT_IDEAS.md
// idea 3): an idea in Hebrew, then the opening words, then a full sentence.
// The full sentence is sent only after the user says it out loud, so a whole
// conversation can't be finished by tapping.

// How close a spoken attempt must be to count as saying the sentence, and
// below which it's taken as the user's own, different answer.
export const SAID_IT_SCORE = 70;
export const OWN_ANSWER_SCORE = 40;

// A turn's help from the AI reply (ai.service.js sendMessage), or null when
// there is none (hard mode, or the model left it out).
export function helpFrom(response) {
  const help = {
    hintHe: response?.hint_he || "",
    starter: response?.starter || "",
    sentence: response?.suggested_user_responses?.[0] || null,
  };
  return ladderSteps(help).length ? help : null;
}

// The steps a turn's help has content for, in order.
export function ladderSteps(help) {
  if (!help) return [];
  return [
    help.hintHe && "idea",
    help.starter && "starter",
    help.sentence?.en && "sentence",
  ].filter(Boolean);
}

// What to do with a turn the user sent while `target` (the full sentence)
// is shown: { send: { text, turn } } or { retry: "say-it" | "not-quite" }.
export function routeTurn({ target, text, turn }) {
  if (!target) return { send: { text, turn } };
  const { score } = scorePronunciation(target, text);
  if (score >= SAID_IT_SCORE) {
    return turn?.source === "spoken"
      ? { send: { text: target, turn: { source: "suggestion" } } }
      : { retry: "say-it" };
  }
  if (turn?.source === "spoken" && score >= OWN_ANSWER_SCORE) return { retry: "not-quite" };
  return { send: { text, turn } };
}
