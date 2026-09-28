// Beta allowlist for the AI proxy (CRITICAL_REVIEW.md §26א). Any Google
// account can sign in, so without this every account gets the daily AI
// quota at our expense. ALLOWED_EMAILS is a comma-separated list, set in the
// Netlify environment. Only an email Google has verified counts, since an
// unverified one could be anyone's.
//
// Unset, the proxy stays open to every signed-in user, as before, with a
// warning in the log. That way deploying this can't lock everyone out
// before the list is set.
import { HttpError } from "./http.js";

let warnedOpen = false;

// Throws HttpError 403 not_in_beta unless `user` may use the AI.
// `allowedEmails` is only overridden by tests.
export function requireBetaAccess(user, { allowedEmails = process.env.ALLOWED_EMAILS } = {}) {
  const allowed = (allowedEmails || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  if (!allowed.length) {
    if (!warnedOpen) {
      console.warn("ALLOWED_EMAILS is not set: AI access is open to every signed-in user");
      warnedOpen = true;
    }
    return;
  }

  const email = user?.email?.toLowerCase();
  if (!user?.emailVerified || !email || !allowed.includes(email)) {
    throw new HttpError(403, "not_in_beta", "AI practice is open to beta participants only");
  }
}
