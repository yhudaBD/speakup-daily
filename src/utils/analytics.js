// Lightweight, fire-and-forget usage logging for the private dashboard
// (netlify/functions/get-dashboard-data.js + usage_dashboard.html). Writing
// is intentionally open to any client — these are anonymous usage pings tied
// to the local device id, never chat content — but reading them back is
// locked behind ADMIN_SECRET server-side. Never awaited by callers and never
// throws, so a logging hiccup can't affect the actual feature.
const LOG_URL = "/api/log-event";

export function logEvent(userId, userName, type, details = {}) {
  if (!userId || typeof fetch === "undefined") return;
  try {
    fetch(LOG_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, userName, type, details }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // ignore — analytics must never break the app
  }
}
