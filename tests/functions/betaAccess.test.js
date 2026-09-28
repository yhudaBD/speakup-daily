import { afterEach, describe, expect, it, vi } from "vitest";
import { requireBetaAccess } from "../../netlify/functions/_shared/betaAccess.js";

// CRITICAL_REVIEW.md §26א: while the beta runs, only listed accounts reach
// the AI proxy.
const user = (email, emailVerified = true) => ({ uid: "uid-1", email, emailVerified });
const allowedEmails = "dana@example.com, Noa@Example.com";

afterEach(() => vi.restoreAllMocks());

describe("requireBetaAccess", () => {
  it("lets in a verified email on the list, ignoring case and spaces", () => {
    expect(() => requireBetaAccess(user("dana@example.com"), { allowedEmails })).not.toThrow();
    expect(() => requireBetaAccess(user("NOA@example.com"), { allowedEmails })).not.toThrow();
  });

  it("refuses an email that isn't on the list with 403 not_in_beta", () => {
    expect(() => requireBetaAccess(user("someone@example.com"), { allowedEmails })).toThrow(
      expect.objectContaining({ status: 403, code: "not_in_beta" }),
    );
  });

  it("refuses a listed email that Google hasn't verified", () => {
    expect(() => requireBetaAccess(user("dana@example.com", false), { allowedEmails })).toThrow(
      expect.objectContaining({ status: 403, code: "not_in_beta" }),
    );
  });

  it("refuses an account with no email", () => {
    expect(() => requireBetaAccess(user(undefined), { allowedEmails })).toThrow(
      expect.objectContaining({ status: 403, code: "not_in_beta" }),
    );
  });

  it("lets everyone in, with a warning, when the list isn't set", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => requireBetaAccess(user("someone@example.com"), { allowedEmails: undefined })).not.toThrow();
    expect(() => requireBetaAccess(user("someone@example.com"), { allowedEmails: " " })).not.toThrow();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("ALLOWED_EMAILS"));
  });
});
