import { diffV3 } from "./diffV3";

// The first move of an account to schema 3 and what comes after it
// (MIGRATION_PLAN.md §8), as pure functions.

// Every document, the profile last. The profile is how the app knows the
// account moved, so a move cut off midway just runs again (the ids are
// stable, so it rewrites the same documents).
export function migrationOps(docs, { now, fingerprint }) {
  const ops = diffV3({}, docs, { now });
  const others = ops.filter((o) => o.doc !== "profile/main");
  const profile = ops.find((o) => o.doc === "profile/main") || { doc: "profile/main", fields: [] };
  // The sync's own fields, which diffV3 leaves alone.
  const meta = [[["migratedAt"], now], [["legacyFingerprint"], fingerprint]];
  return [...others, { ...profile, fields: [...profile.fields, ...meta] }];
}

// A fingerprint of the old document. An app on an older version keeps
// writing there for a while; when it changed after the move, the new app
// merges it in again.
export function legacyFingerprint(doc) {
  const text = stableJson(doc ?? null);
  let hash = 0x811c9dc5; // FNV-1a
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${text.length}-${hash.toString(16)}`;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableJson(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

// What the cloud holds, for diffing after a load. Only the most recent
// chats are loaded; when they filled the page, local chats older than the
// oldest loaded one were written before, and don't need writing again.
export function baselineFor(loaded, localDocs, { recentLimit }) {
  const loadedChats = Object.values(loaded.chats || {});
  const chats = { ...loaded.chats };
  if (loadedChats.length >= recentLimit) {
    const oldest = loadedChats.map((c) => c.updatedAt || "").sort()[0];
    for (const [id, chat] of Object.entries(localDocs.chats || {})) {
      if (!chats[id] && (chat.updatedAt || "") < oldest) chats[id] = chat;
    }
  }
  return { profile: loaded.profile, months: loaded.months, chats };
}
