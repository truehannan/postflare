import { describe, it, expect } from "vitest";
import { buildAuthorizationUrl, base64UrlSha256 } from "../../worker/adapters/oauth/helpers";

describe("OAuth helpers", () => {
  it("builds an authorization URL with PKCE", async () => {
    const challenge = await base64UrlSha256("verifier");
    const url = buildAuthorizationUrl("https://example.com/oauth/authorize", {
      clientId: "abc",
      redirectUri: "https://app.example.com/oauth/callback",
      scopes: "read write",
      state: "state-123",
      codeChallenge: challenge,
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("client_id")).toBe("abc");
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("code_challenge")).toBe(challenge);
    expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
    expect(parsed.searchParams.get("state")).toBe("state-123");
  });

  it("computes a URL-safe base64url SHA-256 challenge", async () => {
    const challenge = await base64UrlSha256("hello");
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(challenge.length).toBe(43);
  });
});