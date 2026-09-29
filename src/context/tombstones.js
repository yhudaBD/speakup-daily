// Deletions that follow the account to the other device, and merging days
// (MIGRATION_PLAN.md §6, CRITICAL_REVIEW.md §2ב).
//
// A deleted word, topic or chat leaves a marker in `state.deleted`: its key
// and when it was deleted. A merge drops an item whose marker is later than
// the item's own time, so the other device's copy doesn't bring it back, and
// a deletion made there removes it here too. Markers go after 90 days; by
// then every device has seen them.
import { legacyAttemptId } from "../utils/attemptId";

export const TOMBSTONE_DAYS = 90;
export const DELETED_KINDS = ["words", "chats", "chatTopics", "practiceTopics"];

export const emptyDeleted = () => Object.fromEntries(DELETED_KINDS.map((k) => [k, {}]));

export function normalizeDeleted(deleted) {
  return Object.fromEntries(DELETED_KINDS.map((k) => [k, { ...(deleted?.[k] || {}) }]));
}

export function markDeleted(deleted, kind, keys, at = new Date().toISOString()) {
  const next = normalizeDeleted(deleted);
  for (const key of keys) next[kind][key] = at;
  return next;
}

export function clearDeleted(deleted, kind, keys) {
  const list = [...keys];
  const current = normalizeDeleted(deleted);
  if (!list.some((k) => k in current[kind])) return deleted ?? current;
  for (const key of list) delete current[kind][key];
  return current;
}

// Both sides' markers, the later one for a key, without those past
// TOMBSTONE_DAYS.
export function mergeDeleted(a, b, now = Date.now()) {
  const cutoff = new Date(now - TOMBSTONE_DAYS * 86400000).toISOString();
  const left = normalizeDeleted(a);
  const right = normalizeDeleted(b);
  return Object.fromEntries(DELETED_KINDS.map((kind) => {
    const out = {};
    for (const [key, at] of [...Object.entries(left[kind]), ...Object.entries(right[kind])]) {
      if (at > cutoff && !(out[key] >= at)) out[key] = at;
    }
    return [kind, out];
  }));
}

// The items not deleted after their own time.
export function withoutDeleted(list, markers, key, stamp) {
  if (!markers || !Object.keys(markers).length) return list;
  return (list || []).filter((item) => {
    const at = markers[key(item)];
    return !at || (stamp(item) || "") > at;
  });
}

// Two copies of the days: a day both have keeps each one's attempts and
// chats (by id), so two devices practicing on the same day both count.
// Records are only added, never changed, so a clash is the same record and
// this device's copy stays. A record saved before ids existed is matched by
// the id the migration gave it (schemaV3.js).
export function mergeDays(local = {}, cloud = {}) {
  const out = { ...cloud, ...local };
  for (const date of Object.keys(local)) {
    if (cloud[date]) out[date] = mergeDay(date, local[date], cloud[date]);
  }
  return out;
}

function mergeDay(date, local, cloud) {
  const sentenceId = (s, i) => s.id || legacyAttemptId(date, i, s.sentenceId);
  const localSentences = local.sentences || [];
  const seen = new Set(localSentences.map(sentenceId));
  const sentences = [...localSentences, ...(cloud.sentences || []).filter((s, i) => !seen.has(sentenceId(s, i)))];

  const chatKey = (c, i) => c.chatId ?? `#${i}`;
  const localChats = local.chats || [];
  const seenChats = new Set(localChats.map(chatKey));
  const chats = [...localChats, ...(cloud.chats || []).filter((c, i) => !seenChats.has(chatKey(c, i)))];

  const day = { ...cloud, ...local, sentences };
  if (chats.length || local.chats || cloud.chats) day.chats = chats;
  return day;
}
