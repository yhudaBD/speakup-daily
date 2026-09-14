// Public write endpoint for anonymous usage events (see src/utils/analytics.js).
// No secret required to write — these are low-sensitivity usage pings keyed by
// the caller's local device id, never chat content. Reading them back (get-
// dashboard-data.js) is what's actually locked down.
import { getStore } from "@netlify/blobs";

const ALLOWED_TYPES = new Set(["placement_completed", "session_started", "session_ended"]);

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };
}

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders(), body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders(), body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  const { userId, userName, type, details } = payload;
  if (!userId || !ALLOWED_TYPES.has(type)) {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: "Missing userId or unknown type" }) };
  }

  try {
    const store = getStore("events");
    const key = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await store.setJSON(key, {
      userId: String(userId).slice(0, 100),
      userName: String(userName || "").slice(0, 100),
      type,
      details: details && typeof details === "object" ? details : {},
      ts: new Date().toISOString(),
    });
    return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify({ ok: true }) };
  } catch (error) {
    return { statusCode: 502, headers: corsHeaders(), body: JSON.stringify({ error: error.message || "Storage error" }) };
  }
};
