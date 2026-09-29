// The cloud data structure of schema 3 (MIGRATION_PLAN.md §3), as pure
// functions: migrateToV3 turns a schema 2 document (the single users/{uid}
// document, the same shape as snapshotForSync) into the new documents, and
// v3ToState turns the new documents back into state for LOAD_DATA.
//
//   users/{uid}/profile/main       profile
//   users/{uid}/months/{yyyy-mm}   the days of a month
//   users/{uid}/chats/{chatId}     one full conversation
//
// Lists that two devices may change at once (attempts, words, topics) are
// maps by id, so writes merge by key instead of replacing each other.

import { streakRun } from "../context/selectors";

export const SCHEMA_VERSION_V3 = 3;
// A month document must stay under this (MIGRATION_PLAN.md §3). Firestore's
// hard limit is 1MB.
export const MONTH_DOC_LIMIT_BYTES = 500 * 1024;

// A map key that is also safe in a Firestore field path: no "." or "/".
export function mapKey(value) {
  return encodeURIComponent(String(value)).replace(/\./g, "%2E");
}

// Drops undefined fields at any depth: Firestore refuses a document with
// one anywhere (a chat's topic without an emoji, for example).
function compact(value) {
  if (Array.isArray(value)) return value.map(compact);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined).map(([k, v]) => [k, compact(v)]),
  );
}

const monthOf = (date) => date.slice(0, 7);

// An id for a record saved before ids existed: the same every run, so
// running the migration again writes the same documents.
function legacyAttemptId(date, index, itemId) {
  return `${date}_${String(index).padStart(3, "0")}_${String(itemId).replace(/[^\w-]/g, "_")}`;
}

// A legacy record has no time of its own: noon UTC of its day, a second per
// position, which keeps the day's order.
function legacyAttemptTs(date, index) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0) + index * 1000).toISOString();
}

const missedWordsOf = (wordResults) =>
  Array.isArray(wordResults) ? wordResults.filter((w) => w?.status !== "correct").map((w) => w.word) : undefined;

// A practice record in the state (Practice.jsx, ClozePractice.jsx) → an
// attempt. The text of a sentence from the fixed bank isn't stored: v3ToState
// takes it from the bank again.
export function toAttempt(sentence, { id, ts, bank }) {
  const inBank = bank?.has(sentence.sentenceId);
  return compact({
    id,
    itemId: sentence.sentenceId,
    itemType: "sentence",
    kind: sentence.kind,
    source: sentence.source,
    hintLevel: sentence.hintLevel,
    score: sentence.score,
    firstScore: sentence.firstScore,
    bestScore: sentence.bestScore,
    attempts: sentence.attempts,
    durationMs: sentence.durationMs,
    missedWords: sentence.missedWords ?? missedWordsOf(sentence.wordResults),
    ts,
    text: inBank ? undefined : sentence.text,
    translation: inBank ? undefined : sentence.translation,
    category: inBank ? undefined : sentence.category,
  });
}

// An attempt → the practice record the state and the selectors use.
export function fromAttempt(attempt, bank) {
  const fromBank = bank?.get(attempt.itemId) || {};
  return compact({
    sentenceId: attempt.itemId,
    text: attempt.text ?? fromBank.text,
    translation: attempt.translation ?? fromBank.translation,
    category: attempt.category ?? fromBank.category,
    kind: attempt.kind,
    source: attempt.source,
    hintLevel: attempt.hintLevel,
    score: attempt.score,
    firstScore: attempt.firstScore,
    bestScore: attempt.bestScore,
    attempts: attempt.attempts,
    durationMs: attempt.durationMs,
    missedWords: attempt.missedWords,
  });
}

// A day's conversation summary (SAVE_ROLEPLAY_SESSION), without the
// feedback, which is in the chat's own document.
function toChatSummary(chat, index) {
  const { feedback: _feedback, ...summary } = chat;
  return { key: chat.chatId ? mapKey(chat.chatId) : `legacy_${index}`, summary: compact(summary) };
}

// A list → a map by key, each item keeping its position in `pos` (Firestore
// returns map keys sorted, not in insertion order).
function toMap(list, keyOf, stamp) {
  return Object.fromEntries(
    (list || []).map((item, pos) => [keyOf(item), compact({ ...item, pos, updatedAt: item.updatedAt ?? stamp(item) })]),
  );
}

// A map back to a list in its original order, without deleted items.
function fromMap(map, { keep = [] } = {}) {
  return Object.values(map || {})
    .filter((item) => !item.deletedAt)
    .sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0))
    .map(({ pos: _pos, updatedAt, ...item }) => (keep.includes("updatedAt") && updatedAt ? { ...item, updatedAt } : item));
}

// Schema 2 document → { profile, months, chats } (MIGRATION_PLAN.md §8).
// `bank` maps the fixed sentence bank's ids to their text.
export function migrateToV3(doc, { bank } = {}) {
  const profile = compact({
    schemaVersion: SCHEMA_VERSION_V3,
    ownerUid: doc.ownerUid ?? null,
    user: doc.user,
    settings: doc.settings,
    placement: doc.placement ?? null,
    baseline: doc.baseline ?? null,
    archive: doc.archive ?? null,
    longestStreak: doc.streak?.longest || 0,
    wordBank: toMap(doc.practice?.wordBank, (w) => mapKey(w.word.toLowerCase()), (w) => w.learnedAt ?? null),
    practiceTopics: toMap(doc.practice?.customTopics, (t) => mapKey(t.id), (t) => t.createdAt ?? null),
    chatTopics: toMap(doc.rolePlay?.customTopics, (t) => mapKey(t.id), (t) => t.createdAt ?? null),
  });

  const months = {};
  for (const date of Object.keys(doc.sessions || {}).sort()) {
    const day = doc.sessions[date] || {};
    const month = (months[monthOf(date)] ||= { month: monthOf(date), days: {} });
    const attempts = Object.fromEntries((day.sentences || []).map((s, i) => {
      const id = legacyAttemptId(date, i, s.sentenceId);
      return [id, toAttempt(s, { id, ts: legacyAttemptTs(date, i), bank })];
    }));
    const chats = Object.fromEntries((day.chats || []).map((c, i) => {
      const { key, summary } = toChatSummary(c, i);
      return [key, summary];
    }));
    month.days[date] = compact({ attempts, chats, completedAt: day.completedAt });
  }

  const chats = Object.fromEntries((doc.rolePlay?.chats || []).map((c) => [mapKey(c.id), compact(c)]));

  return { profile, months, chats };
}

// { profile, months, chats } → the LOAD_DATA payload.
export function v3ToState({ profile = {}, months = {}, chats = {} }, { bank } = {}) {
  const sessions = {};
  for (const month of Object.values(months)) {
    for (const [date, day] of Object.entries(month?.days || {})) {
      const sentences = Object.values(day.attempts || {})
        .sort((a, b) => (a.ts || "").localeCompare(b.ts || "") || a.id.localeCompare(b.id))
        .map((a) => fromAttempt(a, bank));
      const dayChats = Object.values(day.chats || {}).sort((a, b) => (a.completedAt || "").localeCompare(b.completedAt || ""));
      sessions[date] = compact({
        sentences,
        chats: dayChats.length ? dayChats : undefined,
        completedAt: day.completedAt,
      });
    }
  }

  const chatList = Object.values(chats)
    .filter((c) => !c.deletedAt)
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));

  const run = streakRun(sessions);
  return {
    schemaVersion: SCHEMA_VERSION_V3,
    ownerUid: profile.ownerUid ?? null,
    user: profile.user,
    settings: profile.settings,
    placement: profile.placement ?? null,
    baseline: profile.baseline ?? null,
    archive: profile.archive ?? null,
    streak: { ...run, longest: Math.max(profile.longestStreak || 0, run.current) },
    sessions,
    rolePlay: { chats: chatList, customTopics: fromMap(profile.chatTopics) },
    practice: { wordBank: fromMap(profile.wordBank, { keep: ["updatedAt"] }), customTopics: fromMap(profile.practiceTopics) },
    lifetimeStats: {
      totalSentences: (profile.archive?.sentences || 0)
        + Object.values(sessions).reduce((n, d) => n + (d.sentences?.length || 0), 0),
    },
  };
}
