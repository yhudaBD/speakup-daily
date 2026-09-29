import { useEffect } from "react";

// Phases where a conversation fills the screen. The summary screens after
// it (done, analysis, placement result) are longer than the screen and
// scroll like any page.
const SUMMARY_PHASES = new Set(["IDLE", "ERROR", "DONE"]);

export function chatPhaseIsImmersive(phase) {
  return Boolean(phase) && !SUMMARY_PHASES.has(phase);
}

// The full-screen chat layout (html.immersive-chat in index.css): no bottom
// nav, and the page itself doesn't scroll, only the messages. It stayed on
// after a conversation ended, which left the analysis unscrollable.
export function useImmersiveChat(active) {
  useEffect(() => {
    if (!active) return undefined;
    document.documentElement.classList.add("immersive-chat");
    return () => document.documentElement.classList.remove("immersive-chat");
  }, [active]);
}
