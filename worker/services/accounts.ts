import type { Env } from "../env";
import { getPlatform } from "../../shared/capabilities";
import { getAdapter } from "../adapters/registry";
import { randomId } from "../utils/id";
import { notFound } from "../utils/http";
import { getCredentials } from "./credentials";
import { audit } from "./audit";
import { notify } from "./notifications";
import type { AccountStatus, ConnectedAccount } from "../../shared/types";

interface CreateAccountInput {
  workspaceId: string;
  providerId: string;
  credentialsId: string | null;
  externalId: string;
  accountName: string;
  username: string;
  avatarUrl: string | null;
  tokenExpiresAt: string | null;
}

export async function createAccount(env: Env, input: CreateAccountInput): Promise<string> {
  const id = randomId("acct");
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO connected_accounts
      (id, workspace_id, provider_id, credentials_id, external_id, account_name, username, avatar_url, status, is_default, token_expires_at, last_synced_at, last_error, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'connected', 0, ?, ?, NULL, ?, ?)`,
  ).bind(
    id,
    input.workspaceId,
    input.providerId,
    input.credentialsId,
    input.externalId,
    input.accountName,
    input.username,
    input.avatarUrl,
    input.tokenExpiresAt,
    now,
    now,
    now,
  ).run();
  return id;
}

function mapAccount(row: Record<string, unknown>): ConnectedAccount {
  const platform = getPlatform(row.provider_id as string);
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    providerId: row.provider_id as string,
    providerName: platform?.name ?? (row.provider_id as string),
    accountName: row.account_name as string,
    username: (row.username as string | null) ?? "",
    avatarUrl: row.avatar_url as string | null,
    status: row.status as AccountStatus,
    isDefault: (row.is_default as number) === 1,
    tokenExpiresAt: row.token_expires_at as string | null,
    lastSyncedAt: row.last_synced_at as string | null,
    lastError: row.last_error as string | null,
    connectionMode: (row.connection_mode as ConnectedAccount["connectionMode"]) ?? "direct",
    capabilities: Object.keys(platform?.capabilities ?? {}),
    createdAt: row.created_at as string,
  };
}

export async function listAccounts(env: Env, workspaceId: string): Promise<ConnectedAccount[]> {
  const rows = await env.DB.prepare(
    "SELECT * FROM connected_accounts WHERE workspace_id = ? ORDER BY provider_id, account_name",
  ).bind(workspaceId).all<Record<string, unknown>>();
  return (rows.results ?? []).map(mapAccount);
}

export async function getAccount(env: Env, workspaceId: string, accountId: string): Promise<ConnectedAccount> {
  const row = await env.DB.prepare(
    "SELECT * FROM connected_accounts WHERE id = ? AND workspace_id = ?",
  ).bind(accountId, workspaceId).first<Record<string, unknown>>();
  if (!row) throw notFound("Account not found");
  return mapAccount(row);
}

export async function getAccountCredentials(
  env: Env,
  workspaceId: string,
  accountId: string,
): Promise<{ account: ConnectedAccount; credentials: Record<string, string> }> {
  const account = await getAccount(env, workspaceId, accountId);
  const row = await env.DB.prepare(
    "SELECT provider_id FROM connected_accounts WHERE id = ?",
  ).bind(accountId).first<{ provider_id: string }>();
  const credentials = (await getCredentials(env, workspaceId, row!.provider_id)) ?? {};
  return { account, credentials };
}

export async function updateAccountStatus(
  env: Env,
  workspaceId: string,
  accountId: string,
  status: AccountStatus,
  error?: string | null,
): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.prepare(
    "UPDATE connected_accounts SET status = ?, last_error = ?, updated_at = ? WHERE id = ? AND workspace_id = ?",
  ).bind(status, error ?? null, now, accountId, workspaceId).run();
}

export async function deleteAccount(env: Env, workspaceId: string, accountId: string, actorId: string): Promise<void> {
  const existing = await env.DB.prepare("SELECT id FROM connected_accounts WHERE id = ? AND workspace_id = ?")
    .bind(accountId, workspaceId).first<{ id: string }>();
  if (!existing) throw notFound("Account not found");
  await env.DB.prepare("DELETE FROM connected_accounts WHERE id = ?").bind(accountId).run();
  await audit(env, workspaceId, actorId, "account.disconnect", "connected_accounts", accountId, {});
}

export async function setDefaultAccount(env: Env, workspaceId: string, accountId: string): Promise<void> {
  await env.DB.prepare("UPDATE connected_accounts SET is_default = 0 WHERE workspace_id = ?").bind(workspaceId).run();
  await env.DB.prepare("UPDATE connected_accounts SET is_default = 1 WHERE id = ? AND workspace_id = ?").bind(accountId, workspaceId).run();
}

/** Test connectivity to an account and update its status. */
export async function testAccount(env: Env, workspaceId: string, accountId: string): Promise<{ ok: boolean; message: string }> {
  const { account, credentials } = await getAccountCredentials(env, workspaceId, accountId);

  // Composio-backed accounts are verified against Composio, not the platform adapter.
  if (account.connectionMode === "composio") {
    const { getComposioApiKey, testComposioAccount } = await import("./composio");
    const apiKey = await getComposioApiKey(env, workspaceId);
    if (!apiKey) {
      return { ok: false, message: "Composio API key is not configured" };
    }
    const composioIdRow = await env.DB.prepare(
      "SELECT external_id FROM connected_accounts WHERE id = ?",
    ).bind(accountId).first<{ external_id: string }>();
    const result = await testComposioAccount(env, apiKey, composioIdRow?.external_id ?? "");
    await updateAccountStatus(env, workspaceId, accountId, result.ok ? "connected" : "error", result.ok ? null : result.message);
    return result;
  }

  const adapter = getAdapter(account.providerId);
  if (!adapter.validateCredentials) {
    return { ok: false, message: "This provider does not support connectivity testing" };
  }
  const result = await adapter.validateCredentials(credentials);
  await updateAccountStatus(env, workspaceId, accountId, result.ok ? "connected" : "error", result.ok ? null : result.message);
  if (!result.ok) {
    await notify(env, { workspaceId, type: "account.error", title: `Account needs attention`, body: `${account.accountName}: ${result.message}` });
  }
  return { ok: result.ok, message: result.message ?? "" };
}