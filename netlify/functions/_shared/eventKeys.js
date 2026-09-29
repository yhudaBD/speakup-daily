// Where usage events are kept in the "events" blob store, and how a user's
// events are deleted (CRITICAL_REVIEW.md §41ב). Keys start with the uid, so
// one user's events are a prefix listing rather than a scan of everyone's.

// `${uid}/${timestamp}_${random}`. Events written before this change are
// keyed `${timestamp}_${random}`, with the uid in the event itself.
export function eventKey(uid, now = Date.now(), random = crypto.randomUUID().slice(0, 8)) {
  return `${uid}/${now}_${random}`;
}

// Deletes every event of `uid`: those under its prefix, and older ones
// (no "/" in the key) whose uid field matches. Returns how many.
export async function deleteUserEvents(store, uid) {
  const own = (await store.list({ prefix: `${uid}/` })).blobs.map((b) => b.key);

  const legacy = [];
  const { blobs } = await store.list();
  for (const { key } of blobs.filter((b) => !b.key.includes("/"))) {
    const event = await store.get(key, { type: "json" }).catch(() => null);
    if (event?.uid === uid) legacy.push(key);
  }

  const keys = [...own, ...legacy];
  await Promise.all(keys.map((key) => store.delete(key)));
  return keys.length;
}
