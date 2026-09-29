// A unique id for a new practice record, made when it's saved. Two devices
// practicing on the same day write their attempts under their own ids and
// don't overwrite each other (MIGRATION_PLAN.md §5). Safe as a Firestore map
// key: letters, digits and "-" only.
export function newAttemptId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// The id of a record saved before ids existed: its day, its position that
// day and its sentence, the same on every run and on every device
// (schemaV3.js migrateToV3, tombstones.js mergeDays).
export function legacyAttemptId(date, index, itemId) {
  return `${date}_${String(index).padStart(3, "0")}_${String(itemId).replace(/[^\w-]/g, "_")}`;
}
