// The "day 1" recordings (T5 in ACTION_PLAN.md), kept in IndexedDB on this
// device only. Nothing here is sent to a server. Keyed by account uid, so on
// a shared device one account never sees another's, and "delete account"
// removes only its own.
//
// Audio is stored as an ArrayBuffer with its mimeType rather than as a Blob:
// older iOS Safari versions failed to store Blobs in IndexedDB, and iOS and
// Chrome record in different formats (audio/mp4 vs audio/webm), so the
// format must travel with the bytes to play them back.

const DB_NAME = "speakup-recordings";
const STORE = "baseline";
const VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(STORE, { keyPath: "key" });
      store.createIndex("uid", "uid");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Runs `work(store)` in one transaction and resolves when it commits.
async function withStore(mode, work) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      let result;
      Promise.resolve(work(tx.objectStore(STORE))).then((value) => { result = value; }, reject);
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

const request = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

// Saves one topic's recording, replacing any earlier take of that topic.
export async function saveBaselineRecording(uid, { promptId, blob, mimeType, durationMs }) {
  const audio = await blob.arrayBuffer();
  await withStore("readwrite", (store) => {
    store.put({
      key: `${uid}:${promptId}`,
      uid,
      promptId,
      audio,
      mimeType: mimeType || blob.type || "",
      durationMs,
      recordedAt: new Date().toISOString(),
    });
  });
}

// This account's recordings, each with a playable `blob`.
export async function listBaselineRecordings(uid) {
  const rows = await withStore("readonly", (store) => request(store.index("uid").getAll(uid)));
  return (rows || []).map(({ audio, mimeType, ...rest }) => ({
    ...rest,
    mimeType,
    blob: new Blob([audio], { type: mimeType }),
  }));
}

// Deletes from inside the request's own callback, not after an await: older
// Safari versions could commit the transaction in between.
export async function deleteBaselineRecordings(uid) {
  await withStore("readwrite", (store) => {
    const keysReq = store.index("uid").getAllKeys(uid);
    keysReq.onsuccess = () => {
      for (const key of keysReq.result) store.delete(key);
    };
  });
}

// "Not now" hides the offer until the app is opened again. Per visit, so it
// lives in sessionStorage, not in the synced state.
const DISMISSED_KEY = "speakup_baseline_dismissed";

export function dismissBaselineForNow() {
  try {
    sessionStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    // Storage blocked: the offer just shows again.
  }
}

export function isBaselineDismissed() {
  try {
    return sessionStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

// Asks the browser not to evict the recordings when space runs low. Only a
// request: browsers may say no, and older ones don't support it.
export async function requestPersistentStorage() {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
