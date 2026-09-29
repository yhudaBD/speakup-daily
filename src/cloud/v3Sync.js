import { diffV3 } from "./diffV3";
import { writeOps } from "./v3Store";

// Writes the state to the schema 3 documents (MIGRATION_PLAN.md §5,
// CRITICAL_REVIEW.md §27):
// - changes wait DEBOUNCE_MS and go together, only what changed (diffV3);
// - when the page is hidden or closed, what's waiting goes at once;
// - one write at a time, each against what the last successful one wrote;
// - a failed write leaves the baseline alone, so the next write carries it
//   again. `track` (cloudSync.track) shows the banner while it fails.
export const DEBOUNCE_MS = 2000;

// The documents with one of them replaced: "profile/main", "months/{m}" or
// "chats/{id}".
function withDoc(docs, path, data) {
  if (path === "profile/main") return { ...docs, profile: data };
  const [collection, id] = path.split("/");
  return { ...docs, [collection]: { ...docs[collection], [id]: data } };
}

export function createV3Sync({
  uid,
  baseline,
  toDocs,
  write = writeOps,
  track = (promise) => promise,
  now = () => new Date().toISOString(),
  debounceMs = DEBOUNCE_MS,
}) {
  let written = baseline;
  let pending = null;
  let timer = null;
  let chain = Promise.resolve();
  // Documents from the other device (setDoc) while a write is under way.
  let arrived = null;

  const run = async () => {
    if (!pending) return;
    const next = toDocs(pending);
    pending = null;
    const ops = diffV3(written, next, { now: now() });
    if (!ops.length) return;
    arrived = [];
    try {
      await track(write(uid, ops));
      written = next;
      // What the other device changed while this write was on its way.
      for (const [path, data] of arrived) written = withDoc(written, path, data);
    } finally {
      arrived = null;
    }
  };

  // Writes what's waiting, after any write already under way.
  const flush = () => {
    clearTimeout(timer);
    timer = null;
    const result = chain.then(run);
    chain = result.catch(() => {});
    return result;
  };

  const flushQuietly = () => { flush().catch(() => {}); };
  const onHidden = () => { if (document.visibilityState === "hidden") flushQuietly(); };
  window.addEventListener("pagehide", flushQuietly);
  document.addEventListener("visibilitychange", onHidden);

  return {
    schedule(state) {
      pending = state;
      clearTimeout(timer);
      timer = setTimeout(flushQuietly, debounceMs);
    },
    flush,
    // What the cloud holds, as far as this device knows.
    setBaseline(docs) { written = docs; },
    // One document as the cloud now holds it, from the other device
    // (realtime.js): the next write is against it.
    setDoc(path, data) {
      written = withDoc(written, path, data);
      arrived?.push([path, data]);
    },
    dispose() {
      clearTimeout(timer);
      window.removeEventListener("pagehide", flushQuietly);
      document.removeEventListener("visibilitychange", onHidden);
    },
  };
}
