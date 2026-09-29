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

  const run = async () => {
    if (!pending) return;
    const next = toDocs(pending);
    pending = null;
    const ops = diffV3(written, next, { now: now() });
    if (!ops.length) return;
    await track(write(uid, ops));
    written = next;
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
    // What the cloud holds, as far as this device knows: after a load or a
    // change from another device (part D).
    setBaseline(docs) { written = docs; },
    dispose() {
      clearTimeout(timer);
      window.removeEventListener("pagehide", flushQuietly);
      document.removeEventListener("visibilitychange", onHidden);
    },
  };
}
