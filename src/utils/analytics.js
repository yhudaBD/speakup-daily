// Lightweight, fire-and-forget usage logging for the private dashboard
// (netlify/functions/get-dashboard-data.js + usage_dashboard.html). These
// are usage pings tied to the local device id, never chat content, and
// never the user's name or email (CRITICAL_REVIEW.md §41א): the dashboard
// shows a short uid instead. Writing needs the signed-in user's ID token
// (log-event.js rejects anonymous writes). Reading them back is locked
// behind ADMIN_SECRET server-side. Never awaited by callers and never
// throws, so a logging hiccup can't affect the actual feature.
import { auth } from "../services/firebase";

const LOG_URL = "/api/log-event";

export function logEvent(userId, type, details = {}) {
  if (!userId || typeof fetch === "undefined") return;
  const user = auth?.currentUser;
  if (!user) return;
  user
    .getIdToken()
    .then((token) =>
      fetch(LOG_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId, type, details }),
        keepalive: true,
      }),
    )
    .catch(() => {
      // ignore — analytics must never break the app
    });
}

// Deletes this user's usage events on the server (CRITICAL_REVIEW.md §41ב).
// Unlike logEvent it's awaited and throws: "delete account" must not report
// success while the events remain. Resolves to how many were deleted.
export async function deleteMyEvents() {
  const user = auth?.currentUser;
  if (!user) throw new Error("Not signed in");
  const token = await user.getIdToken();
  const response = await fetch("/api/delete-my-events", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Deleting usage events failed: ${response.status}`);
  return (await response.json()).deleted;
}
