import { describe, expect, it } from "vitest";
import { initialScripts, overBudget } from "../../scripts/check-bundle-size.mjs";

// CRITICAL_REVIEW.md §39 fix #4: the build fails when what the first screen
// downloads grows past the budget.
describe("check-bundle-size", () => {
  it("finds the entry script and the chunks it preloads, not the lazy pages", () => {
    const html = `<head>
      <script type="module" crossorigin src="/assets/index-abc.js"></script>
      <link rel="modulepreload" crossorigin href="/assets/react-def.js">
      <link rel="modulepreload" crossorigin href="/assets/firebase-ghi.js">
      <link rel="stylesheet" crossorigin href="/assets/index-abc.css">
    </head>`;
    expect(initialScripts(html)).toEqual(["assets/index-abc.js", "assets/react-def.js", "assets/firebase-ghi.js"]);
  });

  it("is over the budget only past it", () => {
    expect(overBudget(300 * 1024, 300)).toBe(false);
    expect(overBudget(300 * 1024 + 1, 300)).toBe(true);
  });
});
