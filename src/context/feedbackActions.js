import { levelAdjustment } from "./selectors";

// What saving a conversation's analysis does to the state, as actions.
// The Hebrew tips (grammar_notes, improvements) stay in the analysis: they
// used to be merged into the placement's gaps and pushed its own out after
// a few conversations (CRITICAL_REVIEW.md §15א). Only a conversation with 4
// turns of the user's own moves the level (§14), and one leaning on
// suggestions can't raise it (§5).
export function actionsForFeedback({ chatId, feedback, messages }) {
  const actions = [{ type: "UPDATE_ROLEPLAY_FEEDBACK", payload: { chatId, feedback } }];
  const adjustment = levelAdjustment(messages, feedback);
  if (adjustment) actions.push({ type: "ADJUST_LEVEL", payload: adjustment });
  return actions;
}
