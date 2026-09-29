import { describe, expect, it } from "vitest";
import { actionsForFeedback } from "../../src/context/feedbackActions";
import { initialState, reducer } from "../../src/context/appState";

const own = (n) => Array.from({ length: n }, (_, i) => ({ role: "user", content: `t${i}`, source: "spoken" }));
const feedback = {
  overall_score: 90, rubric: { fluency: 5, grammar: 5, vocabulary: 4 }, summary: "טוב",
  grammar_notes: ["נסה להשתמש יותר בזמן עבר"], improvements: ["שים לב לסדר המילים"],
};

// CRITICAL_REVIEW.md §15א: Hebrew tips from the analysis used to be merged
// into the placement gaps, pushing the placement's own out after a few
// conversations.
describe("actionsForFeedback", () => {
  it("saves the feedback and adjusts the level, without touching the placement gaps", () => {
    const actions = actionsForFeedback({ chatId: "c1", feedback, messages: own(4) });
    expect(actions.map((a) => a.type)).toEqual(["UPDATE_ROLEPLAY_FEEDBACK", "ADJUST_LEVEL"]);
    expect(actions[1].payload).toEqual({ score: 90, helpedShare: 0 });
  });

  it("only saves the feedback of a conversation too short to move the level (§14)", () => {
    const actions = actionsForFeedback({ chatId: "c1", feedback, messages: own(3) });
    expect(actions.map((a) => a.type)).toEqual(["UPDATE_ROLEPLAY_FEEDBACK"]);
  });

  it("keeps the placement's gaps through an analyzed conversation", () => {
    const gaps = ["past simple", "th sound"];
    let state = reducer(initialState, { type: "LOAD_DATA", payload: { placement: { overall_level: "B1", gaps } } });
    for (const action of actionsForFeedback({ chatId: "c1", feedback, messages: own(5) })) state = reducer(state, action);
    expect(state.placement.gaps).toEqual(gaps);
  });
});
