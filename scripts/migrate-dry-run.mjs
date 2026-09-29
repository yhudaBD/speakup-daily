// A dry run of the move to schema 3 (MIGRATION_PLAN.md §8, ACTION_PLAN.md
// 7ו): reads every account's old document, moves it in memory and reads it
// back (src/cloud/dryRun.js), and prints what the move would lose or break.
//
// Read only: writes nothing. Prints only numbers, never a uid or any
// content, like scripts/measure-cloud-docs.mjs. The write itself is tested
// against the Firestore emulator in CI (rules-tests/migrationWrite.js).
//
// Run from the repo root with a Firebase service account key:
//   1. Firebase Console → Project settings → Service accounts →
//      "Generate new private key". Save the file outside the repo, or in
//      .secrets/ (ignored by git). Never commit it.
//   2. GOOGLE_APPLICATION_CREDENTIALS=path/to/key.json node scripts/migrate-dry-run.mjs
//   3. Delete the key when done, or revoke it in Google Cloud Console →
//      IAM → Service accounts, since it can read and write everything.
import { runnerImport } from "vite";

// The app's modules use imports without extensions, which Node can't
// resolve; Vite loads them as the app does.
const load = async (path) => (await runnerImport(path)).module;

async function main() {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error("Set GOOGLE_APPLICATION_CREDENTIALS to a service account key file. See the top of this file.");
    process.exitCode = 1;
    return;
  }
  const { checkAccount, summarizeChecks } = await load("./src/cloud/dryRun.js");
  const { getSentenceBank } = await load("./src/cloud/bank.js");
  const { initializeApp, applicationDefault } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  initializeApp({ credential: applicationDefault() });

  const snapshot = await getFirestore().collection("users").get();
  const today = new Date().toISOString().slice(0, 10);
  const bank = getSentenceBank();
  const results = snapshot.docs.map((doc) => {
    try {
      return checkAccount(doc.data(), { bank, today });
    } catch {
      return { counts: {}, docs: 0, maxDocBytes: 0, problems: ["crashed"] };
    }
  });
  const s = summarizeChecks(results);

  console.log(`accounts:   ${s.accounts} (passed ${s.passed}, failed ${s.failed})`);
  console.log(`totals:     ${Object.entries(s.totals).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  console.log(`largest:    ${s.maxDocBytes} bytes (${(s.maxDocBytes / 1024).toFixed(1)}KB), limit 500KB`);
  for (const [problem, count] of Object.entries(s.problems)) console.log(`problem:    ${problem} in ${count} account(s)`);
  if (!s.failed) console.log("OK: every account moves without losing anything.");
  else process.exitCode = 1;
}

main().catch((err) => {
  console.error(err.message || err);
  process.exitCode = 1;
});
