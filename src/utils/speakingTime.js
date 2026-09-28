// Reports a finished session's speaking time for the North Star (T4 in
// ACTION_PLAN.md): whole seconds only, never content. independent_sec is
// what the user said on their own in a conversation; repeat_sec is reading
// sentences aloud in practice. Nothing is sent when both are zero.
import { logEvent } from "./analytics";
import { independentSpeakingMs, repeatSpeakingMs } from "../context/selectors";

export function reportSpeakingTime(userId, kind, { messages, sentences } = {}) {
  const independentSec = Math.round(independentSpeakingMs(messages) / 1000);
  const repeatSec = Math.round(repeatSpeakingMs(sentences) / 1000);
  if (!independentSec && !repeatSec) return;
  logEvent(userId, "speaking_time", { kind, independent_sec: independentSec, repeat_sec: repeatSec });
}
