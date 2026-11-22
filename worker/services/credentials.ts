import type { Env } from "../env";
import { getPlatform } from "../../shared/capabilities";
import { COMPOSIO_CREDENTIAL_FIELDS, COMPOSIO_PROVIDER_ID } from "../../shared/composio";
import { buildKeyring, decrypt, encrypt, parseEnvelope, serializeEnvelope, type Keyring } from "../utils/crypto";
import { randomId } from "../utils/id";
import { badRequest, notFound } from "../utils/http";
import { getAdapter } from "../adapters/registry";
import { audit } from "./audit";

export const MASKED_VALUE = "••••••••••••••••";

/** Keyrings are cached per-ENCRYPTION_KEY for the lifetime of the isolate. */
const keyringCache = new Map<string, Promise<Keyring>>();

export function getKeyring(env: Env): Promise<Keyring> {
  const key = env.ENCRYPTION_KEY;
  if (!key || key.trim() === "") {
    throw new Error("ENCRYPTION_KEY is not configured. Set it with `npx wrangler secret put ENCRYPTION_KEY` (see docs/security.md).");
  }
  let cached = keyringCache.get(key);
  if (!cached) {
    cached = buildKeyring(key);
    keyringCache.set(key, cached);
  }
  return cached;
}

export interface CredentialFields {
  [key: string]: string;
}

export interface CredentialRecord {
  id: string;
  workspaceId: string;
  providerId: string;
  fields: CredentialFields;
  masked: Record<string, string>;
  fieldKeys: string[];
  updatedAt: string;
}

/** Credential schema for a provider: the Composio hub or a platform adapter. */
function credentialSchema(providerId: string) {
  if (providerId === COMPOSIO_PROVIDER_ID) return COMPOSIO_CREDENTIAL_FIELDS;
  return getPlatform(providerId)?.credentialFields ?? [];
}

function requiredFields(providerId: string): string[] {
  return credentialSchema(providerId)
    .filter((f) => f.required)
    .map((f) => f.key);
}

export async function storeCredentials(
  env: Env,
  workspaceId: string,
  providerId: string,
  fields: CredentialFields,
  actorId: string,
): Promise<void> {
  const platform = providerId === COMPOSIO_PROVIDER_ID ? null : getPlatform(providerId);
  if (!platform && providerId !== COMPOSIO_PROVIDER_ID) throw notFound("Unknown integration provider");

  const required = requiredFields(providerId);
  const missing = required.filter((k) => !fields[k]?.trim());
  if (missing.length > 0) {
    throw badRequest(`Missing required fields: ${missing.join(", ")}`);
  }

  // Drop empty optional fields; never store blanks.
  const cleaned: CredentialFields = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v && v.trim() !== "") cleaned[k] = v;
  }

  const keyring = await getKeyring(env);
  const envelope = await encrypt(JSON.stringify(cleaned), keyring);
  const fieldKeys = Object.keys(cleaned);
  const masked: Record<string, string> = {};
  for (const k of fieldKeys) masked[k] = MASKED_VALUE;

  const now = new Date().toISOString();
  const existing = await env.DB.prepare(
    "SELECT id FROM integration_credentials WHERE workspace_id = ? AND provider_id = ?",
  ).bind(workspaceId, providerId).first<{ id: string }>();

  if (existing) {
    await env.DB.prepare(
      "UPDATE integration_credentials SET ciphertext = ?, key_version = ?, field_keys_json = ?, masked_json = ?, updated_at = ? WHERE id = ?",
    ).bind(serializeEnvelope(envelope), envelope.keyVersion, JSON.stringify(fieldKeys), JSON.stringify(masked), now, existing.id).run();
    await audit(env, workspaceId, actorId, "credentials.update", "integration_credentials", existing.id, { providerId });
  } else {
    const id = randomId("cred");
    await env.DB.prepare(
      "INSERT INTO integration_credentials (id, workspace_id, provider_id, ciphertext, key_version, field_keys_json, masked_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(id, workspaceId, providerId, serializeEnvelope(envelope), envelope.keyVersion, JSON.stringify(fieldKeys), JSON.stringify(masked), now, now).run();
    await audit(env, workspaceId, actorId, "credentials.create", "integration_credentials", id, { providerId });
  }
}

/** Server-only: decrypt credentials. Never expose outside the Worker. */
export async function getCredentials(
  env: Env,
  workspaceId: string,
  providerId: string,
): Promise<CredentialFields | null> {
  const row = await env.DB.prepare(
    "SELECT ciphertext FROM integration_credentials WHERE workspace_id = ? AND provider_id = ?",
  ).bind(workspaceId, providerId).first<{ ciphertext: string }>();
  if (!row) return null;
  const keyring = await getKeyring(env);
  const envelope = parseEnvelope(row.ciphertext);
  const plaintext = await decrypt(envelope, keyring);
  return JSON.parse(plaintext) as CredentialFields;
}

export async function getCredentialRecord(
  env: Env,
  workspaceId: string,
  providerId: string,
): Promise<CredentialRecord | null> {
  const row = await env.DB.prepare(
    "SELECT id, provider_id, field_keys_json, masked_json, updated_at FROM integration_credentials WHERE workspace_id = ? AND provider_id = ?",
  ).bind(workspaceId, providerId).first<{ id: string; provider_id: string; field_keys_json: string; masked_json: string; updated_at: string }>();
  if (!row) return null;
  return {
    id: row.id,
    workspaceId,
    providerId: row.provider_id,
    fields: {},
    masked: JSON.parse(row.masked_json) as Record<string, string>,
    fieldKeys: JSON.parse(row.field_keys_json) as string[],
    updatedAt: row.updated_at,
  };
}

export async function listCredentialRecords(
  env: Env,
  workspaceId: string,
): Promise<CredentialRecord[]> {
  const rows = await env.DB.prepare(
    "SELECT id, provider_id, field_keys_json, masked_json, updated_at FROM integration_credentials WHERE workspace_id = ? ORDER BY provider_id",
  ).bind(workspaceId).all<{ id: string; provider_id: string; field_keys_json: string; masked_json: string; updated_at: string }>();
  return (rows.results ?? []).map((r) => ({
    id: r.id,
    workspaceId,
    providerId: r.provider_id,
    fields: {},
    masked: JSON.parse(r.masked_json) as Record<string, string>,
    fieldKeys: JSON.parse(r.field_keys_json) as string[],
    updatedAt: r.updated_at,
  }));
}

export async function deleteCredentials(
  env: Env,
  workspaceId: string,
  providerId: string,
  actorId: string,
): Promise<void> {
  const existing = await env.DB.prepare(
    "SELECT id FROM integration_credentials WHERE workspace_id = ? AND provider_id = ?",
  ).bind(workspaceId, providerId).first<{ id: string }>();
  if (!existing) throw notFound("No credentials stored for this provider");
  await env.DB.prepare("DELETE FROM integration_credentials WHERE id = ?").bind(existing.id).run();
  await audit(env, workspaceId, actorId, "credentials.delete", "integration_credentials", existing.id, { providerId });
}

export interface TestResult {
  ok: boolean;
  message: string;
}

export async function testCredentials(
  env: Env,
  workspaceId: string,
  providerId: string,
  fields?: CredentialFields,
): Promise<TestResult> {
  // The Composio hub key is tested against Composio, not a platform adapter.
  if (providerId === COMPOSIO_PROVIDER_ID) {
    const { testComposioKey } = await import("./composio");
    const credentials = fields ?? (await getCredentials(env, workspaceId, providerId));
    const apiKey = credentials?.apiKey ?? "";
    return testComposioKey(env, apiKey);
  }
  const adapter = getAdapter(providerId);
  if (!adapter.validateCredentials) {
    return { ok: false, message: "This provider does not support credential testing" };
  }
  const credentials = fields ?? (await getCredentials(env, workspaceId, providerId));
  if (!credentials) throw notFound("No credentials stored for this provider");
  const result = await adapter.validateCredentials(credentials);
  return { ok: result.ok, message: result.message ?? (result.ok ? "Credentials are valid" : "Credentials are invalid") };
}