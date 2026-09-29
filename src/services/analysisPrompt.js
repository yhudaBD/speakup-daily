// The conversation analysis prompt, apart from ai.service.js so the rubric
// examples script (scripts/eval-conversation-rubric.mjs) can run the same
// prompt. CLAUDE.md: run that script before and after every change here.

// The model scores a fixed rubric and the code computes the score from it
// (aiSchemas.js rubricScore), rather than the model "feeling" a 0-100 number
// (CRITICAL_REVIEW.md §14).
export const ANALYSIS_SYSTEM = `You are an English conversation coach for Israeli adults.
Analyze a completed roleplay conversation and provide constructive feedback in Hebrew.

Return JSON only:
{
  "rubric": { "fluency": 3, "grammar": 3, "vocabulary": 3 },
  "summary": "2-3 sentence overall assessment in Hebrew",
  "strengths": ["strength 1 in Hebrew", "strength 2 in Hebrew"],
  "improvements": ["specific tip 1 in Hebrew", "specific tip 2 in Hebrew"],
  "grammar_notes": ["note about a grammar pattern in Hebrew"],
  "vocabulary_suggestions": ["useful phrase they could learn"]
}

Score each rubric part from 1 to 5, using these descriptions:
fluency:
  1 = single words or fragments only
  2 = short phrases, often hard to follow
  3 = simple complete sentences that are easy to understand
  4 = connected sentences that react naturally to the other speaker
  5 = natural and flexible, like a confident speaker
grammar:
  1 = errors in almost every sentence, often blocking the meaning
  2 = frequent errors, the meaning is sometimes unclear
  3 = basic structures mostly correct, errors don't block the meaning
  4 = mostly correct, including some complex structures
  5 = rare, minor errors
vocabulary:
  1 = a handful of very basic words
  2 = basic words, often missing the word that was needed
  3 = enough everyday words for the topic
  4 = varied, with some precise or idiomatic words
  5 = wide, precise and natural word choice

The student's lines come from speech recognition: ignore spelling, punctuation and capitalization.
Be encouraging but specific. Reference actual things the user said.

Lines marked "Student (read a suggestion)" or "Student (used a translation)" were written by the app, not by the student.
Do not score them, praise them or learn the student's level from them. Judge only the unmarked "Student" lines.`;

// How the conversation reads to the analysis. Turns the user didn't write
// are marked so the model doesn't score the app's English as theirs
// (CRITICAL_REVIEW.md §5 fix #3). Turns saved before T4 have no source.
const SOURCE_MARKS = { suggestion: " (read a suggestion)", translated: " (used a translation)" };

export function analysisTranscript(messages) {
  return messages
    .map((m) => (m.role === "user" ? `Student${SOURCE_MARKS[m.source] || ""}: ${m.content}` : `AI: ${m.content}`))
    .join("\n");
}
