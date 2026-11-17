import type { Env } from "../env";
import { getPlatform } from "../../shared/capabilities";
import { getAdapter } from "../adapters/registry";
import { randomBase64 } from "../utils/base64";
import { randomId } from "../utils/id";
import { badRequest, notFound, unauthorized } from "../utils/http";
import { getCredentials, storeCredentials, type CredentialFields } from "./credentials";
import { createAccount } from "./accounts";

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes, single use

export async function beginOAuth(
  env: Env,
  workspaceId: string,
  providerId: string,
  redirectUri: string,
): Promise<{ url: string; state: string }> {
  const platform = getPlatform(providerId);
  if (!platform?.oauth) throw notFound("This provider does not support OAuth");

  const adapter = getAdapter(providerId);
  if (!adapter.getAuthorizationUrl || !adapter.exchangeAuthorizationCode) {
    throw notFound("OAuth is not implemented for this provider");
  }

  // The client ID/secret must already be configured through the dashboard.
  const creds = await getCredentials(env, workspaceId, providerId);
  const clientId = creds?.clientId ?? creds?.appId ?? creds?.apiKey;
  if (!clientId) {
    throw badRequest("Configure the OAuth client ID (and secret) for this provider first");
  }

  const state = randomBase64(24);
  const pkce = platform.oauth.pkce ? { verifier: randomBase64(48).slice(0, 96), challenge: "" } : null;
  const codeVerifier = pkce?.verifier;

  const url = await adapter.getAuthorizationUrl({
    clientId,
    clientSecret: creds?.clientSecret ?? creds?.appSecret ?? creds?.apiSecret ?? "",
    redirectUri,
    scopes: platform.oauth.scopes,
    state,
    codeVerifier,
  });

  await env.DB.prepare(
    "INSERT INTO oauth_states (id, workspace_id, provider_id, state, code_verifier, redirect_uri, expires_at, used, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)",
  )
    .bind(
      randomId("oauth"),
      workspaceId,
      providerId,
      state,
      codeVerifier ?? null,
      redirectUri,
      new Date(Date.now() + STATE_TTL_MS).toISOString(),
      new Date().toISOString(),
    )
    .run();

  return { url, state };
}

export async function completeOAuth(
  env: Env,
  providerId: string,
  code: string,
  state: string,
  redirectUri: string,
): Promise<{ accountId: string; providerId: string; accountName: string }> {
  const platform = getPlatform(providerId);
  if (!platform?.oauth) throw notFound("This provider does not support OAuth");

  const row = await env.DB.prepare(
    "SELECT id, workspace_id, state, code_verifier, redirect_uri, expires_at, used FROM oauth_states WHERE state = ? AND provider_id = ?",
  ).bind(state, providerId).first<{ id: string; workspace_id: string; state: string; code_verifier: string | null; redirect_uri: string; expires_at: string; used: number }>();

  if (!row) throw unauthorized("Invalid OAuth state");
  if (row.used === 1) throw unauthorized("OAuth state has already been used");
  if (new Date(row.expires_at).getTime() < Date.now()) throw unauthorized("OAuth state has expired");

  const adapter = getAdapter(providerId);
  const creds = await getCredentials(env, row.workspace_id, providerId);
  const clientId = creds?.clientId ?? creds?.appId ?? creds?.apiKey;
  if (!clientId) throw badRequest("Configure the OAuth client ID first");

  // Use the redirect URI recorded at beginOAuth (never the callback's claim).
  const exchangeRedirectUri = row.redirect_uri || redirectUri;
  const tokens = await adapter.exchangeAuthorizationCode!({
    clientId,
    clientSecret: creds?.clientSecret ?? creds?.appSecret ?? creds?.apiSecret ?? "",
    redirectUri: exchangeRedirectUri,
    code,
    codeVerifier: row.code_verifier ?? undefined,
  });

  // Persist tokens (merged into the existing provider credential record).
  const existing = (await getCredentials(env, row.workspace_id, providerId)) ?? {};
  const merged: CredentialFields = {
    ...existing,
    accessToken: tokens.accessToken,
    ...(tokens.refreshToken ? { refreshToken: tokens.refreshToken } : {}),
    ...(tokens.expiresIn ? { tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000).toISOString() } : {}),
  };
  await storeCredentials(env, row.workspace_id, providerId, merged, "");

  // Mark the state single-use immediately (defense in depth against races).
  await env.DB.prepare("UPDATE oauth_states SET used = 1 WHERE id = ?").bind(row.id).run();

  // Resolve the connected account profile.
  let accountId = "";
  let accountName = platform.name;
  if (adapter.getAccountProfile) {
    const profile = await adapter.getAccountProfile(merged);
    accountName = profile.accountName;
    const credRow = await env.DB.prepare(
      "SELECT id FROM integration_credentials WHERE workspace_id = ? AND provider_id = ?",
    ).bind(row.workspace_id, providerId).first<{ id: string }>();
    accountId = await createAccount(env, {
      workspaceId: row.workspace_id,
      providerId,
      credentialsId: credRow?.id ?? null,
      externalId: profile.externalId,
      accountName: profile.accountName,
      username: profile.username,
      avatarUrl: profile.avatarUrl ?? null,
      tokenExpiresAt: merged.tokenExpiresAt ?? null,
    });
  }

  return { accountId, providerId, accountName };
}