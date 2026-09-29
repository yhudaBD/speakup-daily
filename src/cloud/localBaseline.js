// What the cloud holds for an account, as this device last knew it
// (ACTION_PLAN.md 7ג2): the schema 3 documents and `since`, the server's
// time of the newest document read. The next open reads the profile and
// only the documents written after `since` (v3Store.js loadV3), instead of
// every month and chat. Without it (a new device, cleared storage) the open
// reads everything, as before.
//
// Kept apart from the app state (STORAGE_KEY): it's what the cloud has,
// not what this device has, and the diff needs both.
const keyFor = (uid) => `speakup_v3_baseline_${uid}`;

function defaultStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readBaseline(uid, storage = defaultStorage()) {
  try {
    const saved = JSON.parse(storage?.getItem(keyFor(uid)) ?? "null");
    return saved && typeof saved.since === "number" && saved.docs?.profile ? saved : null;
  } catch {
    return null;
  }
}

export function saveBaseline(uid, { since, docs }, storage = defaultStorage()) {
  try {
    storage?.setItem(keyFor(uid), JSON.stringify({ since, docs }));
  } catch {
    // Full or blocked: the next open reads everything, which is still right.
  }
}

export function clearBaseline(uid, storage = defaultStorage()) {
  try {
    storage?.removeItem(keyFor(uid));
  } catch {
    // Blocked: nothing to clear.
  }
}

// The kept documents with the changed ones read over them.
export function mergeChanged(kept, changed) {
  return {
    profile: changed.profile,
    months: { ...kept.months, ...changed.months },
    chats: { ...kept.chats, ...changed.chats },
  };
}
