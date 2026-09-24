// Small request/response helpers shared by the v2 functions in this folder.
//
// No CORS headers on purpose: the app and its /api/* functions are served
// from the same origin (see the /api/* rewrite in netlify.toml), so browsers
// need none. Leaving Access-Control-Allow-Origin out means other sites'
// scripts can't read these responses. CORS was never what kept
// non-browser callers out, though: that's requireUser() in auth.js.
//
// This folder is not itself a function: Netlify only treats a subdirectory
// as one if it holds index.js or a file named after the folder.

export class HttpError extends Error {
  constructor(status, code, message = code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function json(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export function errorResponse(err) {
  if (err instanceof HttpError) {
    return json(err.status, { error: { code: err.code, message: err.message } });
  }
  console.error("Unhandled function error:", err);
  return json(500, { error: { code: "internal_error", message: "Internal error" } });
}

export function requirePost(req) {
  if (req.method !== "POST") throw new HttpError(405, "method_not_allowed", "Method not allowed");
}

// Reads and parses a JSON body, refusing anything over maxBytes before and
// after reading it: Content-Length can be absent or wrong, so the real body
// length is checked too.
export async function readJson(req, maxBytes) {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new HttpError(413, "payload_too_large", `Body exceeds ${maxBytes} bytes`);
  }
  const text = await req.text();
  if (new TextEncoder().encode(text).length > maxBytes) {
    throw new HttpError(413, "payload_too_large", `Body exceeds ${maxBytes} bytes`);
  }
  try {
    return JSON.parse(text || "{}");
  } catch {
    throw new HttpError(400, "invalid_json", "Invalid JSON body");
  }
}
