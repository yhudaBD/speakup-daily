// Lightweight, fire-and-forget usage logging for the private dashboard
// (netlify/functions/get-dashboard-data.js + usage_dashboard.html). These
// are usage pings tied to the local device id, never chat content. Writing
// needs the signed-in user's ID token (log-event.js rejects anonymous
// writes). Reading them back is locked behind ADMIN_SECRET server-side.
// Never awaited by callers and never throws, so a logging hiccup can't
// affect the actual feature.
import { auth } from "../services/firebase";

const LOG_URL = "/api/log-event";

export function logEvent(userId, userName, type, details = {}) {
  if (!userId || typeof fetch === "undefined") return;
  const user = auth?.currentUser;
  if (!user) return;
  user
    .getIdToken()
    .then((token) =>
      fetch(LOG_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId, userName, type, details }),
        keepalive: true,
      }),
    )
    .catch(() => {
      // ignore — analytics must never break the app
    });
}
