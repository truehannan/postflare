import { base64Encode } from "../../utils/base64";

export async function base64UrlSha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return base64Encode(new Uint8Array(digest)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function buildAuthorizationUrl(
  authorizationUrl: string,
  params: {
    clientId: string;
    redirectUri: string;
    scopes: string;
    state: string;
    codeChallenge?: string;
    extra?: Record<string, string>;
  },
): string {
  const url = new URL(authorizationUrl);
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", params.state);
  if (params.scopes) url.searchParams.set("scope", params.scopes);
  if (params.codeChallenge) {
    url.searchParams.set("code_challenge", params.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
  }
  for (const [k, v] of Object.entries(params.extra ?? {})) {
    url.searchParams.set(k, v);
  }
  return url.toString();
}

export async function exchangeCode(
  tokenUrl: string,
  params: {
    clientId: string;
    clientSecret?: string;
    redirectUri: string;
    code: string;
    codeVerifier?: string;
  },
): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number; scope?: string }> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: params.clientId,
  });
  if (params.clientSecret) body.set("client_secret", params.clientSecret);
  if (params.codeVerifier) body.set("code_verifier", params.codeVerifier);

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error((json.error_description as string) ?? (json.error as string) ?? `Token exchange failed: HTTP ${res.status}`);
  }
  return {
    accessToken: json.access_token as string,
    refreshToken: json.refresh_token as string | undefined,
    expiresIn: json.expires_in as number | undefined,
    scope: json.scope as string | undefined,
  };
}

export async function refreshToken(
  tokenUrl: string,
  params: { clientId: string; clientSecret?: string; refreshToken: string },
): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number }> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: params.refreshToken,
    client_id: params.clientId,
  });
  if (params.clientSecret) body.set("client_secret", params.clientSecret);
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error((json.error_description as string) ?? (json.error as string) ?? `Token refresh failed: HTTP ${res.status}`);
  }
  return {
    accessToken: json.access_token as string,
    refreshToken: json.refresh_token as string | undefined,
    expiresIn: json.expires_in as number | undefined,
  };
}

export function notImplementedPublish(feature: string) {
  return () =>
    Promise.resolve({
      ok: false,
      error: `${feature} is not implemented for this provider yet. This adapter exposes the connection and OAuth flow, but publishing requires additional integration work.`,
      errorCode: "not_implemented",
      retryable: false,
    });
}