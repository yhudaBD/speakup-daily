import { v3ToState } from "./schemaV3";

// Changes from the other device while the app is open (MIGRATION_PLAN.md
// §6): listens to the profile and this month's document. A change is merged
// in (MERGE_CLOUD_DATA unites by id and respects deletion markers) and
// becomes what this device knows the cloud holds, so the next write carries
// only what this device added. Chats aren't listened to: only one device
// talks in a conversation at a time, and the next open loads them.
//
// `listen(path, onData)` subscribes to one document and returns its
// unsubscribe (v3Store.js listenDoc). `month()` is this month, "yyyy-mm".
export function startRealtime({ sync, dispatch, bank, listen, month }) {
  const onDoc = (path, toDocs) => (data) => {
    sync.setDoc(path, data);
    dispatch({ type: "MERGE_CLOUD_DATA", payload: v3ToState(toDocs(data), { bank }) });
  };

  const stopProfile = listen("profile/main", onDoc("profile/main", (profile) => ({ profile })));
  let current = null;
  let stopMonth = () => {};
  const watchMonth = () => {
    const m = month();
    if (m === current) return;
    stopMonth();
    current = m;
    stopMonth = listen(`months/${m}`, onDoc(`months/${m}`, (data) => ({ months: { [m]: data } })));
  };
  watchMonth();

  // The month may have changed while the app was in the background.
  const onVisible = () => { if (document.visibilityState !== "hidden") watchMonth(); };
  document.addEventListener("visibilitychange", onVisible);

  return () => {
    document.removeEventListener("visibilitychange", onVisible);
    stopProfile();
    stopMonth();
  };
}
