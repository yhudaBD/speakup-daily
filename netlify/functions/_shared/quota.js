// Per-account daily cap on AI calls, so one account can't run up the Groq
// bill without limit, whether by a script or a stuck retry loop.
//
// A read-then-write counter in Netlify Blobs, not an atomic increment, so a
// burst of parallel calls can overshoot the cap by a few. That's fine for a
// cost guard. If Blobs is unreachable (including `netlify dev` on a site
// that isn't linked, see README), the check fails open: requireUser() has
// already verified who is calling, and a storage hiccup shouldn't take the
// AI features down with it.
import { getStore } from "@netlify/blobs";
import { HttpError } from "./http.js";

// Worst realistic day: a few 10-turn roleplays at ~2 calls per turn (plus
// client-side JSON retries), a placement test and some transcriptions.
// Nowhere near this.
const DEFAULT_DAILY_LIMIT = 600;

function dailyLimit() {
  const fromEnv = Number(process.env.AI_DAILY_LIMIT_PER_USER);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_DAILY_LIMIT;
}

// Throws HttpError 429 once `uid` has used today's quota. Otherwise counts
// this call and returns a promise for the count write, so the caller can
// await it alongside the Groq request rather than before it.
export async function consumeDailyQuota(uid, { store, now = new Date() } = {}) {
  const key = `${now.toISOString().slice(0, 10)}/${uid}`;
  let quotaStore = store;
  let used;
  try {
    quotaStore ??= getStore({ name: "ai-quota", consistency: "strong" });
    used = (await quotaStore.get(key, { type: "json" }))?.count || 0;
  } catch (err) {
    console.warn("AI quota check skipped (storage unavailable):", err?.message || err);
    return Promise.resolve();
  }

  if (used >= dailyLimit()) {
    throw new HttpError(429, "daily_quota_exceeded", "Daily AI usage limit reached. Try again tomorrow.");
  }
  return quotaStore
    .setJSON(key, { count: used + 1 })
    .catch((err) => console.warn("AI quota write failed:", err?.message || err));
}
