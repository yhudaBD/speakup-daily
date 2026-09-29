import { sentences } from "../data/sentences";

// The fixed sentence bank by id. Schema 3 doesn't store the text of these
// sentences with each attempt (MIGRATION_PLAN.md §3.2); it comes from here.
let bank = null;
export function getSentenceBank() {
  bank ||= new Map(sentences.map((s) => [s.id, { text: s.text, translation: s.translation, category: s.category }]));
  return bank;
}
