// Whether the account's latest changes have reached the cloud, and how close
// its Firestore document is to the 1MB cap (CRITICAL_REVIEW.md §1א).
//
// A failed write used to go only to console.error, so a user whose
// document had outgrown the cap kept working on a copy that never synced.
// Now a write that fails, or hasn't landed after CLOUD_WRITE_TIMEOUT_MS,
// flags the changes as local-only and CloudSyncBanner says so. Offline,
// Firestore doesn't fail a write, it holds it, hence the timeout. The flag
// follows the latest write only: every write is a full snapshot, so a newer
// one landing covers an older one that failed.

export const CLOUD_WRITE_TIMEOUT_MS = 15_000;

const KB = 1024;

// Size of the document as JSON, in UTF-8 bytes. Close to, not exactly,
// Firestore's own count. Takes the object or its JSON string.
export function docSizeBytes(data) {
  return new Blob([typeof data === "string" ? data : JSON.stringify(data)]).size;
}

// A coarse range for reporting, never the exact size. null below 700KB.
export const SIZE_RANGES = ["700-800KB", "800-900KB", "900KB+"];
export function sizeRange(bytes) {
  if (bytes >= 900 * KB) return "900KB+";
  if (bytes >= 800 * KB) return "800-900KB";
  if (bytes >= 700 * KB) return "700-800KB";
  return null;
}

export function createCloudSyncTracker({ timeoutMs = CLOUD_WRITE_TIMEOUT_MS } = {}) {
  let localOnly = false;
  let latest = 0;
  const listeners = new Set();

  const set = (value) => {
    if (value === localOnly) return;
    localOnly = value;
    for (const listener of listeners) listener(value);
  };

  return {
    isLocalOnly: () => localOnly,
    // Returns an unsubscribe function.
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    // Resolves or rejects like `write`, so the caller can still log.
    track(write) {
      const id = ++latest;
      const timer = setTimeout(() => { if (id === latest) set(true); }, timeoutMs);
      return write.then(
        (value) => {
          clearTimeout(timer);
          if (id === latest) set(false);
          return value;
        },
        (err) => {
          clearTimeout(timer);
          if (id === latest) set(true);
          throw err;
        },
      );
    },
  };
}

// The app's one tracker: AppContext tracks its writes, CloudSyncBanner shows it.
export const cloudSync = createCloudSyncTracker();
