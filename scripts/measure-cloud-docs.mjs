// Measures how big the users' Firestore documents are (T3 in ACTION_PLAN.md).
// The review's estimate that documents reach the 1MB cap "within a few
// months" assumed 10 sentences a day and was never measured. The result
// decides how urgent the migration is: a max over 500KB moves stage 7
// ahead of stage 5 (STATUS.md).
//
// Read only. Prints only the number of documents and the median, 90th
// percentile and max size, in bytes of JSON. Never a uid or any content.
//
// Run from the repo root with a Firebase service account key:
//   1. Firebase Console → Project settings → Service accounts →
//      "Generate new private key". Save the file outside the repo, or in
//      .secrets/ (ignored by git). Never commit it.
//   2. GOOGLE_APPLICATION_CREDENTIALS=path/to/key.json node scripts/measure-cloud-docs.mjs
//   3. Delete the key when done, or revoke it in Google Cloud Console →
//      IAM → Service accounts, since it can read and write everything.
import { pathToFileURL } from "node:url";

// Size of a document as JSON, in UTF-8 bytes. The same measure the app uses
// before each write (src/services/cloudSync.js); close to, not exactly,
// Firestore's own count.
export function jsonBytes(data) {
  return Buffer.byteLength(JSON.stringify(data), "utf8");
}

// Nearest-rank percentiles, so every reported value is a real document size.
export function summarizeSizes(sizes) {
  if (!sizes.length) return { count: 0, median: 0, p90: 0, max: 0 };
  const sorted = [...sizes].sort((a, b) => a - b);
  const rank = (p) => sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
  return { count: sorted.length, median: rank(0.5), p90: rank(0.9), max: sorted[sorted.length - 1] };
}

async function main() {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error("Set GOOGLE_APPLICATION_CREDENTIALS to a service account key file. See the top of this file.");
    process.exit(1);
  }
  const { initializeApp, applicationDefault } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  initializeApp({ credential: applicationDefault() });

  const snapshot = await getFirestore().collection("users").get();
  const sizes = snapshot.docs.map((doc) => jsonBytes(doc.data()));
  const { count, median, p90, max } = summarizeSizes(sizes);
  const kb = (bytes) => `${bytes} bytes (${(bytes / 1024).toFixed(1)}KB)`;

  console.log(`documents: ${count}`);
  console.log(`median:    ${kb(median)}`);
  console.log(`p90:       ${kb(p90)}`);
  console.log(`max:       ${kb(max)}`);
  if (max > 500 * 1024) console.log("max is over 500KB: per STATUS.md, stage 7 (migration) moves ahead of stage 5.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}
