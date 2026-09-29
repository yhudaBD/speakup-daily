import { reducer, snapshotForSync } from "../context/appState";
import { loadCloudProfile } from "../services/firebase";
import { mergeChanged } from "./localBaseline";
import { baselineFor, legacyFingerprint, migrationOps } from "./migrationFlow";
import { migrateToV3, v3ToState } from "./schemaV3";
import { RECENT_CHATS, loadV3, writeOps } from "./v3Store";
import { createV3Sync } from "./v3Sync";

// Opens schema 3 for a signed-in account (MIGRATION_PLAN.md §8) and returns
// its sync (v3Sync.js):
// - first open after the update: merges the old document into this device's
//   state, writes every document, the profile last, and leaves the old
//   document as it was;
// - later opens: loads the new documents, and merges the old document again
//   if an app on an older version wrote to it since (its fingerprint changed).
// `local` is the state before any of this; merges are dispatched and also
// applied here, to know what the documents will be.
//
// `baselineStore` keeps what the cloud holds between opens (localBaseline.js):
// with it, an open reads the profile and only what changed since the last
// one (ACTION_PLAN.md 7ג2).
const noStore = { read: () => null, save: () => {} };

export async function openV3({
  uid, local, dispatch, bank, track = (p) => p, now = () => new Date().toISOString(), baselineStore = noStore,
}) {
  const toDocs = (state) => migrateToV3(snapshotForSync(state), { bank });
  const kept = baselineStore.read();
  const [changed, legacy] = await Promise.all([loadV3(uid, { since: kept?.since }), loadCloudProfile(uid)]);
  const fingerprint = legacyFingerprint(legacy);
  // What the cloud holds: what was kept, with what changed since over it.
  const loaded = changed && kept ? mergeChanged(kept.docs, changed) : changed;
  const since = changed?.syncedAt || 0;
  const keep = (docs) => baselineStore.save({ since, docs });

  let state = local;
  const merge = (payload) => {
    const action = { type: "MERGE_CLOUD_DATA", payload };
    state = reducer(state, action);
    dispatch(action);
  };

  if (!loaded) {
    if (legacy) merge(legacy);
    const docs = toDocs(state);
    await track(writeOps(uid, migrationOps(docs, { now: now(), fingerprint })));
    // `since` stays 0: the next open reads everything once, with the stamps.
    return createV3Sync({ uid, baseline: docs, toDocs, track, now, onBaseline: keep });
  }

  merge(v3ToState(loaded, { bank }));
  const legacyChanged = legacy && fingerprint !== loaded.profile.legacyFingerprint;
  if (legacyChanged) merge(legacy);

  const baseline = kept ? loaded : baselineFor(loaded, toDocs(state), { recentLimit: RECENT_CHATS });
  keep(baseline);
  const sync = createV3Sync({ uid, baseline, toDocs, track, now, onBaseline: keep });
  if (legacyChanged) {
    // What the old document added goes out with the new fingerprint.
    await track(writeOps(uid, [{ doc: "profile/main", fields: [[["legacyFingerprint"], fingerprint]] }]));
    sync.schedule(state);
    await sync.flush();
  }
  return sync;
}
