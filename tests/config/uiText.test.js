import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// CRITICAL_REVIEW.md §23א and §32א: typos in the Hebrew UI, and a "back"
// arrow that pointed forward in a right-to-left layout.
function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(jsx?|mjs)$/.test(entry.name) ? [path] : [];
  });
}

const files = sourceFiles("src").map((path) => ({ path, text: readFileSync(path, "utf8") }));
const containing = (needle) => files.filter((f) => f.text.includes(needle)).map((f) => f.path);

describe("UI text", () => {
  it.each(["טרוף", "יייצר", "הקשיב קודם"])("has no %s typo", (typo) => {
    expect(containing(typo)).toEqual([]);
  });

  it("uses → for back, since the UI is right to left", () => {
    expect(containing("←")).toEqual([]);
  });
});
