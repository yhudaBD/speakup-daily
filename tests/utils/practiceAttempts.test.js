import { describe, expect, it } from "vitest";
import { addAttempt, attemptFields } from "../../src/utils/practiceAttempts";
import { attemptScores } from "../../src/context/selectors";

// CRITICAL_REVIEW.md §9: "try again" used to keep only the last attempt,
// saved as attempts: 1.
describe("practice attempts", () => {
  it("keeps the first score, the best score and the real number of attempts", () => {
    let tally = null;
    for (const score of [30, 35, 92, 60]) tally = addAttempt(tally, { score, durationMs: 2000 });
    expect(attemptFields(tally)).toEqual({ firstScore: 30, bestScore: 92, attempts: 4, durationMs: 8000 });
  });

  it("counts a single attempt as its own first and best", () => {
    expect(attemptFields(addAttempt(null, { score: 71, durationMs: 1500.4 })))
      .toEqual({ firstScore: 71, bestScore: 71, attempts: 1, durationMs: 1500 });
  });

  it("leaves out the duration when no attempt measured one", () => {
    const tally = addAttempt(addAttempt(null, { score: 50 }), { score: 80, durationMs: 0 });
    expect(attemptFields(tally)).toEqual({ firstScore: 50, bestScore: 80, attempts: 2 });
  });
});

describe("attemptScores", () => {
  it("reads a new record's fields", () => {
    expect(attemptScores({ score: 60, firstScore: 30, bestScore: 92, attempts: 4 }))
      .toEqual({ firstScore: 30, bestScore: 92, attempts: 4 });
  });

  it("reads an old record's score as its first and best", () => {
    expect(attemptScores({ score: 85, attempts: 1 })).toEqual({ firstScore: 85, bestScore: 85, attempts: 1 });
    expect(attemptScores({ score: 40 })).toEqual({ firstScore: 40, bestScore: 40, attempts: 1 });
  });
});
