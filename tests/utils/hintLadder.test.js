import { describe, expect, it } from "vitest";
import { helpFrom, ladderSteps, routeTurn } from "../../src/utils/hintLadder";

// CRITICAL_REVIEW.md §5 fix #1, through the hint ladder (IMPROVEMENT_IDEAS.md,
// idea 3): an idea in Hebrew, then opening words, then a full sentence that
// is sent only once the user has said it.
describe("ladderSteps", () => {
  it("lists the steps there is content for, in order", () => {
    const help = { hintHe: "תזמין שתייה", starter: "Can I get", sentence: { en: "Can I get a tea?", he: "" } };
    expect(ladderSteps(help)).toEqual(["idea", "starter", "sentence"]);
    expect(ladderSteps({ ...help, hintHe: "" })).toEqual(["starter", "sentence"]);
    expect(ladderSteps({ hintHe: "", starter: "", sentence: null })).toEqual([]);
    expect(ladderSteps(null)).toEqual([]);
  });
});

describe("routeTurn", () => {
  const target = "Can I get a tea please";

  it("sends a turn as is when no full sentence is shown", () => {
    expect(routeTurn({ target: null, text: "Hello", turn: { source: "typed" } }))
      .toEqual({ send: { text: "Hello", turn: { source: "typed" } } });
  });

  it("sends the shown sentence as a suggestion once it's said out loud", () => {
    expect(routeTurn({ target, text: "can I get a tea please", turn: { source: "spoken", durationMs: 2000 } }))
      .toEqual({ send: { text: target, turn: { source: "suggestion" } } });
  });

  it("asks to say it out loud when the shown sentence is typed or pasted", () => {
    expect(routeTurn({ target, text: target, turn: { source: "typed" } })).toEqual({ retry: "say-it" });
    expect(routeTurn({ target, text: target, turn: { source: "translated" } })).toEqual({ retry: "say-it" });
  });

  it("asks to try again when the sentence was said but not quite", () => {
    expect(routeTurn({ target, text: "can I get tea", turn: { source: "spoken" } })).toEqual({ retry: "not-quite" });
  });

  it("sends the user's own different answer as their own turn", () => {
    const turn = { source: "spoken", durationMs: 1500 };
    expect(routeTurn({ target, text: "No thanks, just water", turn }))
      .toEqual({ send: { text: "No thanks, just water", turn } });
  });
});

describe("helpFrom", () => {
  it("takes the idea, the opening words and the first suggested sentence", () => {
    const sentence = { en: "Can I get a tea?", he: "אפשר תה?", hint: "" };
    expect(helpFrom({ hint_he: "תזמין", starter: "Can I", suggested_user_responses: [sentence, { en: "x" }] }))
      .toEqual({ hintHe: "תזמין", starter: "Can I", sentence });
  });

  it("has no help when the reply has none", () => {
    expect(helpFrom({ ai_reply: "Hi", hint_he: "", starter: "", suggested_user_responses: [] })).toBeNull();
    expect(helpFrom(undefined)).toBeNull();
  });
});
