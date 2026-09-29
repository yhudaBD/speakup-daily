// The dry run of the move to schema 3 (MIGRATION_PLAN.md §8,
// scripts/migrate-dry-run.mjs), as pure functions: an account's old
// document is moved in memory and read back, and anything the move would
// lose or break is a problem code. Only numbers leave here, never a uid or
// any content.
import { initialState, reducer } from "../context/appState";
import { selectXp } from "../context/achievements";
import { selectDaysActive, selectSentencesAbove90, selectStreak, selectTotalChats } from "../context/selectors";
import { MONTH_DOC_LIMIT_BYTES, migrateToV3, v3ToState } from "./schemaV3";

const loaded = (payload) => reducer(initialState, { type: "LOAD_DATA", payload });
const bytes = (data) => new TextEncoder().encode(JSON.stringify(data)).length;

function hasUndefined(value) {
  if (value === undefined) return true;
  if (!value || typeof value !== "object") return false;
  return Object.values(value).some(hasUndefined);
}

function countsOf(state) {
  const days = Object.values(state.sessions || {});
  return {
    days: days.length,
    attempts: days.reduce((n, d) => n + (d.sentences?.length || 0), 0),
    dayChats: days.reduce((n, d) => n + (d.chats?.length || 0), 0),
    chats: state.rolePlay?.chats?.length || 0,
    words: state.practice?.wordBank?.length || 0,
  };
}

const numbersOf = (state, today) => [
  selectDaysActive(state), selectStreak(state, today), selectXp(state), selectTotalChats(state), selectSentencesAbove90(state),
];

export function checkAccount(doc, { bank, today, limitBytes = MONTH_DOC_LIMIT_BYTES }) {
  const docs = migrateToV3(doc, { bank });
  const before = loaded(doc);
  const after = loaded(v3ToState(docs, { bank }));
  const counts = countsOf(before);
  const moved = countsOf(after);

  const problems = [];
  if (moved.days !== counts.days) problems.push("days_lost");
  if (moved.attempts !== counts.attempts) problems.push("attempts_lost");
  if (moved.dayChats !== counts.dayChats) problems.push("day_chats_lost");
  if (moved.chats !== counts.chats) problems.push("chats_lost");
  if (moved.words !== counts.words) problems.push("words_lost");
  if (JSON.stringify(numbersOf(after, today)) !== JSON.stringify(numbersOf(before, today))) problems.push("numbers_differ");

  const all = [docs.profile, ...Object.values(docs.months), ...Object.values(docs.chats)];
  const maxDocBytes = Math.max(...all.map(bytes));
  if (maxDocBytes > limitBytes) problems.push("doc_over_limit");
  if (all.some(hasUndefined)) problems.push("undefined_value");

  return { counts, docs: all.length, maxDocBytes, problems };
}

// Every account's check → what the script prints.
export function summarizeChecks(results) {
  const problems = {};
  const totals = { days: 0, attempts: 0, dayChats: 0, chats: 0, words: 0, docs: 0 };
  for (const r of results) {
    for (const p of r.problems) problems[p] = (problems[p] || 0) + 1;
    for (const k of Object.keys(r.counts)) totals[k] += r.counts[k];
    totals.docs += r.docs;
  }
  const failed = results.filter((r) => r.problems.length).length;
  return {
    accounts: results.length,
    passed: results.length - failed,
    failed,
    problems,
    totals,
    maxDocBytes: Math.max(0, ...results.map((r) => r.maxDocBytes)),
  };
}
