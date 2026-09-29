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

// Profile fields that are maps by id: written one entry at a time, and an
// entry removed here becomes a tombstone (deletedAt) rather than vanishing,
// so the other device doesn't bring it back (MIGRATION_PLAN.md §6).
const MAP_FIELDS = new Set(["wordBank", "practiceTopics", "chatTopics"]);

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
    if (key === "updatedAt") continue;
    if (MAP_FIELDS.has(key)) {
      const before = prev[key] || {};
      const after = next[key] || {};
      for (const k of unionKeys(before, after)) {
        if (k in after) {
          if (!same(before[k], after[k])) fields.push([[key, k], after[k]]);
        } else if (!before[k].deletedAt) {
          fields.push([[key, k], { ...before[k], updatedAt: now, deletedAt: now }]);
        }
      }
    } else if (!same(prev[key], next[key])) {
      if (next[key] === undefined) deleteFields.push([key]);
      else fields.push([[key], next[key]]);
    }
  }
  return operation("profile/main", fields, deleteFields, now);
}

function diffDay(date, before, after) {
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
  if (!before) {
    const fields = [[["month"], after.month ?? month]];
    for (const [date, day] of Object.entries(after.days || {})) fields.push([["days", date], day]);
    return operation(`months/${month}`, fields, [], now);
  }
  const fields = [];
  const deleteFields = [];
  for (const [date, day] of Object.entries(after.days || {})) {
    if (!before.days?.[date]) fields.push([["days", date], day]);
    else fields.push(...diffDay(date, before.days[date], day));
  }
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
  // in the cloud; deleting a chat is an explicit tombstone (part D).
  for (const [id, chat] of Object.entries(next.chats || {})) {
    if (!same(withoutUpdatedAt(prev.chats?.[id]), withoutUpdatedAt(chat))) {
      ops.push({ doc: `chats/${id}`, set: { ...chat, updatedAt: now } });
    }
  }

  return ops.filter(Boolean);
}
