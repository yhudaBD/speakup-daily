// Public write endpoint for anonymous usage events (see src/utils/analytics.js).
// No secret required to write — these are low-sensitivity usage pings keyed by
// the caller's local device id, never chat content. Reading them back (get-
// dashboard-data.js) is what's actually locked down.
//
// Written as a v2 function (export default (req, context) =>) rather than the
// classic v1 handler(event) style used elsewhere in this project: Netlify's
// automatic Blobs credential injection (getStore() with no explicit siteID/
// token) only worked reliably in production with the v2 signature during
// testing - the v1 style hit MissingBlobsEnvironmentError even when getStore()
// was called inside the handler (not at module scope, which is the usual
// cause of that error).
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

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("", { status: 204, headers: corsHeaders() });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: corsHeaders() });
  }

  let payload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: corsHeaders() });
  }

  const { userId, userName, type, details } = payload;
  if (!userId || !ALLOWED_TYPES.has(type)) {
    return new Response(JSON.stringify({ error: "Missing userId or unknown type" }), { status: 400, headers: corsHeaders() });
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
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders() });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || "Storage error" }), { status: 502, headers: corsHeaders() });
  }
};
