// Which cloud structure an account uses (MIGRATION_PLAN.md §8): schema 2
// (the single document) unless switched on, first for listed accounts
// (VITE_CLOUD_V3_EMAIL_HASHES, comma separated), then for everyone
// (VITE_CLOUD_SCHEMA=v3). Removing the account from the list, or setting
// VITE_CLOUD_SCHEMA back to v2, and redeploying is the way back.
//
// VITE_ variables ship in the bundle anyone can download, so the list holds
// the SHA-256 of each address (emailHash), never the address itself.
// To get one: node -e "crypto.subtle.digest('SHA-256',new TextEncoder().encode('you@example.com')).then(b=>console.log(Buffer.from(b).toString('hex')))"
export async function emailHash(email) {
  const bytes = new TextEncoder().encode(String(email).trim().toLowerCase());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function cloudSchemaFor(email, env = import.meta.env) {
  if (env.VITE_CLOUD_SCHEMA === "v3") return "v3";
  const listed = String(env.VITE_CLOUD_V3_EMAIL_HASHES || "")
    .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (!email || !listed.length) return "v2";
  return listed.includes(await emailHash(email)) ? "v3" : "v2";
}
