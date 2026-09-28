import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// CRITICAL_REVIEW.md §40: a CSP that allows inline scripts or eval doesn't
// stop injected code, which is the path the dashboard XSS took.
const toml = readFileSync(new URL("../../netlify.toml", import.meta.url), "utf8");
const header = (name) => toml.match(new RegExp(`^\\s*${name} = "([^"]*)"`, "m"))?.[1];

describe("security headers in netlify.toml", () => {
  it("script-src allows neither inline scripts nor eval", () => {
    const scriptSrc = header("Content-Security-Policy").match(/script-src ([^;]*)/)[1];
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
  });

  it("limits the microphone to this site and turns off unused features", () => {
    expect(header("Permissions-Policy")).toBe("microphone=(self), camera=(), geolocation=(), payment=()");
  });

  it("asks browsers to always use HTTPS", () => {
    expect(header("Strict-Transport-Security")).toMatch(/max-age=\d{7,}/);
  });
});

describe("usage_dashboard.html under that CSP", () => {
  const html = readFileSync(new URL("../../public/usage_dashboard.html", import.meta.url), "utf8");

  it("has no inline script blocks", () => {
    const scripts = html.match(/<script[^>]*>/g) || [];
    expect(scripts.every((tag) => /\ssrc=/.test(tag))).toBe(true);
  });

  it("has no inline event handler attributes", () => {
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
  });
});
