import { useCallback, useState } from "react";
import { ladderSteps, routeTurn } from "../utils/hintLadder";

// State of one turn's hint ladder (CRITICAL_REVIEW.md §5): how many steps are
// shown, the full sentence once it's shown (`target`), and why the last turn
// wasn't sent (`notice`). Starts over when the next turn's help arrives.
export function useHintLadder(help, { onHelpUsed } = {}) {
  const [state, setState] = useState({ help, shown: 0, notice: null });
  let current = state;
  if (state.help !== help) {
    current = { help, shown: 0, notice: null };
    setState(current);
  }

  const steps = ladderSteps(help);
  const target = steps[current.shown - 1] === "sentence" ? help.sentence.en : null;

  const next = useCallback(() => {
    if (current.shown >= steps.length) return;
    onHelpUsed?.();
    setState((s) => ({ ...s, shown: Math.min(s.shown + 1, ladderSteps(s.help).length), notice: null }));
  }, [current.shown, steps.length, onHelpUsed]);

  // The turn to send for what the user said or typed, or null (with a
  // notice) when the shown sentence still has to be said out loud.
  const route = useCallback((text, turn) => {
    const result = routeTurn({ target, text, turn });
    if (result.send) return result.send;
    setState((s) => ({ ...s, notice: result.retry }));
    return null;
  }, [target]);

  return { steps, shown: current.shown, target, notice: current.notice, next, route };
}
