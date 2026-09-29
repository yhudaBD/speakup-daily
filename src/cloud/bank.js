// The fixed sentence bank by id. Schema 3 doesn't store the text of these
// sentences with each attempt (MIGRATION_PLAN.md §3.2); it comes from here.
// Loaded on demand, so the bank isn't part of the first download
// (CRITICAL_REVIEW.md §39).
let bank = null;
export async function getSentenceBank() {
  if (!bank) {
    const { sentences } = await import("../data/sentences");
    bank = new Map(sentences.map((s) => [s.id, { text: s.text, translation: s.translation, category: s.category }]));
  }
  return bank;
}
