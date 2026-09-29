import { lazy } from "react";

// Pages load on demand (CRITICAL_REVIEW.md §39). A deploy replaces the old
// chunks, so a tab opened before it can fail to load a page it hasn't
// visited yet: it reloads once to get the new version. If loading fails
// again (offline, say), the error goes to RouteErrorBoundary rather than
// reloading in a loop. The mark lives in sessionStorage, per tab.
const RELOAD_KEY = "speakup_chunk_reload";

function sessionStore() {
  try {
    return window.sessionStorage;
  } catch {
    return null; // storage blocked: fall through to the error boundary
  }
}

export async function importWithReload(load, { storage = sessionStore(), reload = () => window.location.reload() } = {}) {
  try {
    const module = await load();
    try { storage?.removeItem(RELOAD_KEY); } catch { /* ignore */ }
    return module;
  } catch (error) {
    let reloaded = true;
    try { reloaded = !storage || storage.getItem(RELOAD_KEY) === "1"; } catch { /* treat as reloaded */ }
    if (reloaded) {
      try { storage?.removeItem(RELOAD_KEY); } catch { /* ignore */ }
      throw error;
    }
    try { storage.setItem(RELOAD_KEY, "1"); } catch { /* ignore */ }
    reload();
    return new Promise(() => {}); // the page is going away
  }
}

export const lazyPage = (load) => lazy(() => importWithReload(load));
