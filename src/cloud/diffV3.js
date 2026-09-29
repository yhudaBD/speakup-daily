// What to write to the cloud: the difference between the schema 3 documents
// last written (or loaded) and the ones the state makes now
// (MIGRATION_PLAN.md §5). Each change is written at its own field path, so
// two devices writing different attempts, words or days merge instead of
// overwriting each other.
//
// Returns operations for v3Store.js:
//   { doc, fields: [[path, value], ...], deleteFields?: [path, ...] }  update these fields
//   { doc, set: data }                                                  replace the document
//   { doc, delete: true }                                               delete the document
// A path is an array of segments (FieldPath), since map keys are encoded
// and may hold characters a dotted path can't.

// Profile fields that are maps by id: written one entry at a time. A deleted
// item is a marker entry (deletedAt, from tombstones.js via schemaV3.js), so
// the other device doesn't bring it back (MIGRATION_PLAN.md §6). An entry
// that only left this device's list (a full word bank) stays in the cloud;
// a marker that left it (past its 90 days) is removed.
const MAP_FIELDS = new Set(["wordBank", "practiceTopics", "chatTopics"]);
// Profile fields the sync keeps itself, not part of the state: never
// written as a change or deleted for being missing from it.
const META_FIELDS = new Set(["updatedAt", "migratedAt", "legacyFingerprint"]);

// Equal as data, whatever the key order.
function same(a, b) {
  return stableJson(a) === stableJson(b);
}
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableJson(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

const withoutUpdatedAt = ({ updatedAt: _u, ...rest } = {}) => rest;
const unionKeys = (a = {}, b = {}) => [...new Set([...Object.keys(b), ...Object.keys(a)])];

function diffProfile(prev = {}, next = {}, now) {
  const fields = [];
  const deleteFields = [];
  for (const key of unionKeys(prev, next)) {
    if (META_FIELDS.has(key)) continue;
    if (MAP_FIELDS.has(key)) {
      const before = prev[key] || {};
      const after = next[key] || {};
      for (const k of unionKeys(before, after)) {
        if (k in after) {
          if (!same(before[k], after[k])) fields.push([[key, k], after[k]]);
        } else if (before[k]?.deletedAt) {
          deleteFields.push([key, k]);
        }
      }
    } else if (!same(prev[key], next[key])) {
      if (next[key] === undefined) deleteFields.push([key]);
      else fields.push([[key], next[key]]);
    }
  }
  return operation("profile/main", fields, deleteFields, now);
}

// A day is never written whole, a new one included: the other device may
// have written that day already, and a whole day would replace its attempts.
function diffDay(date, before = {}, after = {}) {
  const fields = [];
  for (const key of Object.keys(after)) {
    if (key === "attempts" || key === "chats") {
      for (const [id, value] of Object.entries(after[key] || {})) {
        // Records are only added: one missing here is left in the cloud.
        if (!same(before[key]?.[id], value)) fields.push([["days", date, key, id], value]);
      }
    } else if (!same(before[key], after[key])) {
      fields.push([["days", date, key], after[key]]);
    }
  }
  return fields;
}

function diffMonth(month, before, after, now) {
  const fields = before ? [] : [[["month"], after.month ?? month]];
  const deleteFields = [];
  for (const [date, day] of Object.entries(after.days || {})) {
    fields.push(...diffDay(date, before?.days?.[date], day));
  }
  if (!before) return operation(`months/${month}`, fields, [], now);
  // A day that left the state was folded into the archive (older than a year).
  for (const date of Object.keys(before.days || {})) {
    if (!after.days?.[date]) deleteFields.push(["days", date]);
  }
  return operation(`months/${month}`, fields, deleteFields, now);
}

function operation(doc, fields, deleteFields, now) {
  if (!fields.length && !deleteFields.length) return null;
  return {
    doc,
    fields: [...fields, [["updatedAt"], now]],
    ...(deleteFields.length ? { deleteFields } : {}),
  };
}

export function diffV3(prev = {}, next = {}, { now = new Date().toISOString() } = {}) {
  const ops = [diffProfile(prev.profile, next.profile, now)];

  const prevMonths = prev.months || {};
  const nextMonths = next.months || {};
  for (const month of Object.keys(nextMonths)) ops.push(diffMonth(month, prevMonths[month], nextMonths[month], now));
  // Every day of the month went to the archive.
  for (const month of Object.keys(prevMonths)) {
    if (!nextMonths[month]) ops.push({ doc: `months/${month}`, delete: true });
  }

  // A chat is written whole: only one device talks in a conversation at a
  // time. One that left this device's list (it keeps the latest ones) stays
  // in the cloud; a deleted chat's document is its marker, deleted itself
  // once the marker is past its time.
  for (const [id, chat] of Object.entries(next.chats || {})) {
    if (!same(withoutUpdatedAt(prev.chats?.[id]), withoutUpdatedAt(chat))) {
      ops.push({ doc: `chats/${id}`, set: { ...chat, updatedAt: now } });
    }
  }
  for (const [id, chat] of Object.entries(prev.chats || {})) {
    if (chat?.deletedAt && !next.chats?.[id]) ops.push({ doc: `chats/${id}`, delete: true });
  }

  return ops.filter(Boolean);
}

// A field operation → the nested data and the field paths for one
// set(ref, data, { mergeFields }). `deleteValue` is Firestore's
// deleteField(), passed in so this stays pure.
export function nestFields(op, { deleteValue }) {
  const data = {};
  const paths = [];
  const put = (path, value) => {
    let node = data;
    path.slice(0, -1).forEach((segment) => { node = node[segment] ||= {}; });
    node[path.at(-1)] = value;
    paths.push(path);
  };
  for (const [path, value] of op.fields || []) put(path, value);
  for (const path of op.deleteFields || []) put(path, deleteValue);
  return { data, paths };
}
