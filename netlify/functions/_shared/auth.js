// Verifies the Firebase ID token the client sends as "Authorization: Bearer
// <token>" (src/services/ai.service.js attaches it). Every signed-in user
// has one, since AuthGate makes sign-in mandatory, so it can be required
// on every AI call without turning anyone away.
//
// Verified with Google's public signing keys via jose. That needs no
// firebase-admin and no service-account secret. Tokens are RS256 JWTs whose
// issuer and audience must name this Firebase project:
// https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library
import { createRemoteJWKSet, jwtVerify } from "jose";
import { HttpError } from "./http.js";

// Public, not a secret. It's in every client bundle and in the /__/auth
// proxy target in netlify.toml. The env var lets a fork point elsewhere.
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "speakup-daily-88d5a";

const GOOGLE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
);

// Returns the caller's Firebase uid, or throws HttpError 401/503.
// `keys` and `projectId` are only overridden by tests.
export async function requireUser(req, { keys = GOOGLE_JWKS, projectId = PROJECT_ID } = {}) {
  const match = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") || "");
  if (!match) throw new HttpError(401, "missing_token", "Sign-in required");

  try {
    const { payload } = await jwtVerify(match[1], keys, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
      algorithms: ["RS256"],
    });
    if (!payload.sub) throw new HttpError(401, "invalid_token", "Invalid sign-in token");
    return payload.sub;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    // Couldn't fetch Google's keys: that's our outage, not a bad token.
    if (err?.code === "ERR_JWKS_TIMEOUT" || err instanceof TypeError) {
      console.error("Could not load Firebase signing keys:", err);
      throw new HttpError(503, "auth_unavailable", "Sign-in verification is temporarily unavailable");
    }
    throw new HttpError(401, "invalid_token", "Invalid or expired sign-in token");
  }
}
