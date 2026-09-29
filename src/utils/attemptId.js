// A unique id for a new practice record, made when it's saved. Two devices
// practicing on the same day write their attempts under their own ids and
// don't overwrite each other (MIGRATION_PLAN.md §5). Safe as a Firestore map
// key: letters, digits and "-" only.
export function newAttemptId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
