import { beforeAll, describe, expect, it } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import { requireUser } from "../../netlify/functions/_shared/auth.js";

const PROJECT = "test-project";
let privateKey;
let keys;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "RS256" };
  keys = createLocalJWKSet({ keys: [jwk] });
});

function sign(claims = {}, { exp = "1h", aud = PROJECT, iss = `https://securetoken.google.com/${PROJECT}` } = {}) {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(iss)
    .setAudience(aud)
    .setSubject(claims.sub ?? "uid-123")
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(privateKey);
}

const withAuth = (value) =>
  new Request("http://localhost/api/groq-proxy", { method: "POST", headers: value ? { Authorization: value } : {} });

describe("requireUser", () => {
  it("returns the uid for a valid token", async () => {
    const token = await sign();
    await expect(requireUser(withAuth(`Bearer ${token}`), { keys, projectId: PROJECT })).resolves.toBe("uid-123");
  });

  it("rejects a request with no Authorization header", async () => {
    await expect(requireUser(withAuth(null), { keys, projectId: PROJECT })).rejects.toMatchObject({
      status: 401,
      code: "missing_token",
    });
  });

  it("rejects a garbage token", async () => {
    await expect(requireUser(withAuth("Bearer not.a.jwt"), { keys, projectId: PROJECT })).rejects.toMatchObject({
      status: 401,
      code: "invalid_token",
    });
  });

  it("rejects a token issued for another Firebase project", async () => {
    const token = await sign({}, { aud: "someone-else", iss: "https://securetoken.google.com/someone-else" });
    await expect(requireUser(withAuth(`Bearer ${token}`), { keys, projectId: PROJECT })).rejects.toMatchObject({
      status: 401,
    });
  });

  it("rejects an expired token", async () => {
    const token = await sign({}, { exp: Math.floor(Date.now() / 1000) - 60 });
    await expect(requireUser(withAuth(`Bearer ${token}`), { keys, projectId: PROJECT })).rejects.toMatchObject({
      status: 401,
    });
  });
});
