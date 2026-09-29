// Fails when the JavaScript the first screen downloads grows past the
// budget (CRITICAL_REVIEW.md §39): the entry script and the chunks
// index.html preloads, gzipped. Pages load on demand and don't count.
// Runs after `npm run build`: node scripts/check-bundle-size.mjs
//
// 2026-09-29: about 267KB (app 28KB, React 74KB, Firebase 164KB). The
// budget leaves room for small changes; content for month 1 belongs in
// chunks loaded on demand, not here.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

export const BUDGET_KB = 300;

export function initialScripts(html) {
  const found = [];
  for (const m of html.matchAll(/<script[^>]*\bsrc="\/?([^"]+\.js)"/g)) found.push(m[1]);
  for (const m of html.matchAll(/<link[^>]*rel="modulepreload"[^>]*href="\/?([^"]+\.js)"/g)) found.push(m[1]);
  return found;
}

export const overBudget = (bytes, budgetKb) => bytes > budgetKb * 1024;

function main() {
  const dist = "dist";
  const files = initialScripts(readFileSync(join(dist, "index.html"), "utf8"));
  let total = 0;
  for (const file of files) {
    const size = gzipSync(readFileSync(join(dist, file))).length;
    total += size;
    console.log(`${(size / 1024).toFixed(1).padStart(7)}KB  ${file}`);
  }
  console.log(`${(total / 1024).toFixed(1).padStart(7)}KB  total, gzipped (budget ${BUDGET_KB}KB)`);
  if (!files.length || overBudget(total, BUDGET_KB)) {
    console.error(files.length ? "Over the budget: load the new code on demand (CRITICAL_REVIEW.md §39)." : "No scripts found in dist/index.html.");
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
