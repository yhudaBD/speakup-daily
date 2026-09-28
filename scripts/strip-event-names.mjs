// One-off cleanup for CRITICAL_REVIEW.md §41א. Usage events stored before
// the fix carry the user's full name (userName). This rewrites each such
// event in the "events" Netlify Blobs store without it, and without an
// email if one is there.
//
// Dry run by default: prints only counts, never a name, and writes nothing.
// Nothing changes without --apply. Run from the repo root:
//
//   NETLIFY_AUTH_TOKEN=<token> node scripts/strip-event-names.mjs
//   NETLIFY_AUTH_TOKEN=<token> node scripts/strip-event-names.mjs --apply
//
// The token is a Netlify personal access token (User settings → Applications
// → Personal access tokens). The site id comes from NETLIFY_SITE_ID, or from
// .netlify/state.json when the folder is linked (`netlify link`).
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { getStore } from "@netlify/blobs";

const IDENTIFYING_FIELDS = ["userName", "email"];

// Returns a copy of `event` without the identifying fields, or null when it
// has none, so it isn't rewritten.
export function stripIdentity(event) {
  if (!event || !IDENTIFYING_FIELDS.some((field) => field in event)) return null;
  const clean = { ...event };
  for (const field of IDENTIFYING_FIELDS) delete clean[field];
  return clean;
}

function siteId() {
  if (process.env.NETLIFY_SITE_ID) return process.env.NETLIFY_SITE_ID;
  try {
    return JSON.parse(readFileSync(".netlify/state.json", "utf8")).siteId;
  } catch {
    return undefined;
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  const siteID = siteId();
  const token = process.env.NETLIFY_AUTH_TOKEN;
  if (!siteID || !token) {
    console.error("Set NETLIFY_AUTH_TOKEN, and NETLIFY_SITE_ID unless the folder is linked. See the top of this file.");
    process.exit(1);
  }

  const store = getStore({ name: "events", siteID, token });
  const { blobs } = await store.list();
  let named = 0;
  let failed = 0;
  for (const { key } of blobs) {
    const clean = stripIdentity(await store.get(key, { type: "json" }).catch(() => null));
    if (!clean) continue;
    named++;
    if (apply) await store.setJSON(key, clean).catch(() => { failed++; });
  }

  console.log(`${blobs.length} events, ${named} with a name or email.`);
  console.log(apply
    ? `Rewrote ${named - failed}${failed ? `, ${failed} failed (run again to retry)` : ""}.`
    : "Dry run: nothing was written. Run again with --apply to rewrite them.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
