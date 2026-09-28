// The shape of a usage event's `details`, enforced on the way in
// (log-event.js) and again on the way out (get-dashboard-data.js).
//
// The write endpoint is reachable by any signed-in account, so nothing it
// stores can be trusted as display-ready: an unchecked `level` string was
// enough to plant script in the admin dashboard. Only known fields of the
// expected type survive. Sanitizing again on read also cleans events stored
// before this existed.

export const CEFR_LEVELS = new Set(["Pre-A1", "A1", "A2", "B1", "B2", "C1"]);
// A cloud document's size is reported only as one of these (src/services/cloudSync.js).
export const SIZE_RANGES = ["700-800KB", "800-900KB", "900KB+"];

const text = (v, max) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
const count = (v) => (Number.isFinite(v) && v >= 0 && v <= 1000 ? Math.floor(v) : undefined);
const level = (v) => (CEFR_LEVELS.has(v) ? v : undefined);
// Speaking time per session (T4), in whole seconds: at most 10 hours.
const seconds = (v) => (Number.isFinite(v) && v >= 0 && v <= 36_000 ? Math.floor(v) : undefined);

export function sanitizeDetails(details) {
  const d = details && typeof details === "object" ? details : {};
  const clean = {
    kind: d.kind === "roleplay" || d.kind === "practice" ? d.kind : undefined,
    level: level(d.level),
    currentLevel: level(d.currentLevel),
    topicId: text(d.topicId, 80),
    topicTitle: text(d.topicTitle, 120),
    turnCount: count(d.turnCount),
    helpUsedCount: count(d.helpUsedCount),
    sizeRange: SIZE_RANGES.includes(d.sizeRange) ? d.sizeRange : undefined,
    independent_sec: seconds(d.independent_sec),
    repeat_sec: seconds(d.repeat_sec),
  };
  return Object.fromEntries(Object.entries(clean).filter(([, v]) => v !== undefined));
}
