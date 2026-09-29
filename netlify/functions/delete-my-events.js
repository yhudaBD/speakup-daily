// Deletes the signed-in user's usage events (CRITICAL_REVIEW.md §41ב).
// "Delete account" (deleteAccountData in AppContext.jsx) calls it before
// deleting the Auth record, since after that the user can't be verified.
// A user can only delete their own events: the uid comes from the verified
// token, never from the request.
//
// A v2 function, like log-event.js, for Netlify's Blobs credentials.
import { getStore } from "@netlify/blobs";
import { errorResponse, json, requirePost } from "./_shared/http.js";
import { requireUser } from "./_shared/auth.js";
import { deleteUserEvents } from "./_shared/eventKeys.js";

export default async (req) => {
  try {
    requirePost(req);
    const uid = await requireUser(req);
    const deleted = await deleteUserEvents(getStore("events"), uid);
    return json(200, { ok: true, deleted });
  } catch (err) {
    return errorResponse(err);
  }
};
