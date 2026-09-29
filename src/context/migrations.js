// Pure migrations of the saved data, one per schema version (CLAUDE.md, data
// shape rule). Each takes data at an older version and returns it at the
// current one; data already current comes back as is.

// A practice record's kind, "speak" (said out loud) or "cloze" (sentence
// completion). Records saved before `kind` existed are classified by the rule
// the user approved for CRITICAL_REVIEW.md §8: Practice always saved
// wordResults with a spoken attempt, ClozePractice never did.
export function sentenceKind(sentence) {
  if (sentence?.kind) return sentence.kind;
  return Array.isArray(sentence?.wordResults) ? "speak" : "cloze";
}

// Schema 2: every practice record carries its kind.
function addSentenceKinds(sessions) {
  return Object.fromEntries(
    Object.entries(sessions || {}).map(([date, day]) => [
      date,
      day?.sentences
        ? { ...day, sentences: day.sentences.map((s) => (s?.kind ? s : { ...s, kind: sentenceKind(s) })) }
        : day,
    ]),
  );
}

// Brings saved sessions from `fromVersion` (missing means the oldest) to the
// current schema.
export function migrateSessions(sessions, fromVersion) {
  if (!sessions || (fromVersion || 0) >= 2) return sessions;
  return addSentenceKinds(sessions);
}
