export interface AdapterCredentials {
  [key: string]: string;
}

export interface PublishInput {
  text: string;
  /** Publicly accessible media URLs (already uploaded to R2 / platform). */
  mediaUrls?: string[];
  link?: string;
  title?: string;
  /** Extra platform-specific options. */
  options?: Record<string, unknown>;
}

export interface PublishResult {
  ok: boolean;
  remoteId?: string;
  error?: string;
  errorCode?: string;
  /** Whether the operation can be retried safely. */
  retryable?: boolean;
  /** Safe, redacted summary of the provider response. */
  responseSummary?: string;
}

export interface AccountProfile {
  accountName: string;
  username: string;
  avatarUrl?: string;
  externalId: string;
}

export interface OAuthToken {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  scope?: string;
}

/**
 * Every social platform implements this optional interface. Methods are
 * optional precisely because platforms differ: a missing method means the
 * platform does not support that capability through its official API.
 */
export interface SocialPlatformAdapter {
  providerId: string;
  displayName: string;

  validateCredentials?(credentials: AdapterCredentials): Promise<{ ok: boolean; message?: string }>;

  getAuthorizationUrl?(params: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    scopes: string;
    state: string;
    codeVerifier?: string;
  }): string | Promise<string>;

  exchangeAuthorizationCode?(params: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    code: string;
    codeVerifier?: string;
  }): Promise<OAuthToken>;

  refreshAccessToken?(params: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
  }): Promise<OAuthToken>;

  getAccountProfile?(credentials: AdapterCredentials): Promise<AccountProfile>;

  publishPost?(credentials: AdapterCredentials, input: PublishInput): Promise<PublishResult>;

  deletePost?(credentials: AdapterCredentials, remoteId: string): Promise<PublishResult>;

  sendMessage?(
    credentials: AdapterCredentials,
    recipientId: string,
    text: string,
  ): Promise<PublishResult>;

  getComments?(credentials: AdapterCredentials, postId: string): Promise<unknown[]>;

  getAnalytics?(credentials: AdapterCredentials): Promise<unknown>;

  verifyWebhook?(secret: string, headers: Headers, rawBody: string): Promise<boolean>;
}

/** Small fetch wrapper that parses JSON and surfaces provider errors safely. */
export async function providerFetch(
  url: string,
  init: RequestInit & { token?: string; tokenPrefix?: string } = {},
): Promise<{ status: number; json: unknown; text: string }> {
  const headers = new Headers(init.headers);
  if (init.token) {
    headers.set("Authorization", `${init.tokenPrefix ?? "Bearer"} ${init.token}`);
  }
  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON response */
  }
  return { status: res.status, json, text };
}

export function redactError(value: unknown, maxLen = 400): string {
  if (value == null) return "";
  const s = typeof value === "string" ? value : JSON.stringify(value);
  return s.replace(/(access_token|token|secret|password|key)=[^&\s"]+/gi, "$1=•••").slice(0, maxLen);
}