// Write endpoint for usage events (see src/utils/analytics.js). These are
// usage pings keyed by the caller's local device id, never chat content.
// Reading them back (get-dashboard-data.js) is locked behind ADMIN_SECRET.
//
// Writing requires a signed-in user's Firebase ID token, same as the AI
// proxy, and `details` is reduced to a fixed set of typed fields
// (_shared/events.js). Their values end up in the admin dashboard, so an
// open, unchecked write path was a way to plant script there.
//
// Written as a v2 function (export default (req, context) =>) rather than
// the classic v1 handler(event) style: Netlify's automatic Blobs credential
// injection (getStore() with no explicit siteID/token) only worked reliably
// in production with the v2 signature during testing. The v1 style hit
// MissingBlobsEnvironmentError even when getStore() was called inside the
// handler (not at module scope, which is the usual cause of that error).
import { getStore } from "@netlify/blobs";
import { HttpError, errorResponse, json, readJson, requirePost } from "./_shared/http.js";
import { requireUser } from "./_shared/auth.js";
import { sanitizeDetails } from "./_shared/events.js";

const ALLOWED_TYPES = new Set(["placement_completed", "session_started", "session_ended"]);
const MAX_BODY_BYTES = 4_000;

export default async (req) => {
  try {
    requirePost(req);
    const uid = await requireUser(req);
    const { userId, userName, type, details } = await readJson(req, MAX_BODY_BYTES);
    if (typeof userId !== "string" || !userId || !ALLOWED_TYPES.has(type)) {
      throw new HttpError(400, "invalid_request", "Missing userId or unknown type");
    }

    const store = getStore("events");
    const key = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    await store.setJSON(key, {
      userId: userId.slice(0, 100),
      uid,
      userName: typeof userName === "string" ? userName.slice(0, 100) : "",
      type,
      details: sanitizeDetails(details),
      ts: new Date().toISOString(),
    });
    return json(200, { ok: true });
  } catch (err) {
    return errorResponse(err);
  }
};
