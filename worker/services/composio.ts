/**
 * Postflare — Composio hub service (Worker).
 *
 * Wraps the Composio REST API v3.1 (https://backend.composio.dev/api/v3.1):
 *   GET  /connected_accounts            (x-api-key)
 *   POST /tools/execute/{tool_slug}    {connected_account_id, arguments}
 *
 * The workspace's Composio API key lives in the existing encrypted credential
 * vault under providerId "composio" — never in plaintext, never returned to
 * the browser after submission.
 */
import type { Env } from "../env";
import {
  COMPOSIO_PROVIDER_ID,
  COMPOSIO_SUPPORTED,
  getComposioSupport,
  type ComposioSupport,
} from "../../shared/composio";
import { getCredentials } from "./credentials";
import { randomId } from "../utils/id";
import { badRequest, notFound } from "../utils/http";
import { redactError } from "../adapters/types";
import type { PublishResult } from "../adapters/types";

const DEFAULT_BASE = "https://backend.composio.dev/api/v3.1";

function base(env: Env): string {
  return (env.COMPOSIO_BASE_URL || DEFAULT_BASE).replace(/\/+$/, "");
}

interface ComposioResponse<T = unknown> {
  status: number;
  json: T | null;
  text: string;
}

async function composioFetch<T = unknown>(
  env: Env,
  apiKey: string,
  path: string,
  init: RequestInit = {},
): Promise<ComposioResponse<T>> {
  const res = await fetch(`${base(env)}${path}`, {
    ...init,
    headers: {
      "x-api-key": apiKey,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let json: T | null = null;
  try {
    json = JSON.parse(text) as T;
  } catch {
    /* non-JSON */
  }
  return { status: res.status, json, text };
}

/**
 * Every Postflare-initiated Composio connection is created under this user.
 * Listing also filters by it, so dashboard-made connections (other users) are
 * never picked up accidentally.
 */
export const COMPOSIO_USER = "postflare";

/** Get the workspace's stored Composio API key (decrypted, server-side only). */
export async function getComposioApiKey(env: Env, workspaceId: string): Promise<string | null> {
  const creds = await getCredentials(env, workspaceId, COMPOSIO_PROVIDER_ID);
  return creds?.apiKey ?? null;
}

/** Validate a Composio API key by listing one connected account. */
export async function testComposioKey(env: Env, apiKey: string): Promise<{ ok: boolean; message: string }> {
  if (!apiKey) return { ok: false, message: "API key is required" };
  const res = await composioFetch(env, apiKey, "/connected_accounts?limit=1");
  if (res.status === 200) return { ok: true, message: "Composio API key is valid" };
  if (res.status === 401 || res.status === 403) {
    return { ok: false, message: "Composio rejected this API key" };
  }
  return { ok: false, message: `Composio returned HTTP ${res.status}` };
}

interface ComposioAccountItem {
  id: string;
  status: string;
  alias: string | null;
  word_id: string | null;
  user_id?: string;
  toolkit: { slug: string };
}

interface AuthConfigItem {
  id: string;
  status?: string;
  toolkit?: { slug: string };
}

export interface ComposioLinkResult {
  redirectUrl: string;
  composioAccountId: string | null;
  providerId: string;
}

/**
 * Initiate a Composio connection for a platform under the Postflare user —
 * the auth gateway. Resolves the toolkit's enabled auth config, creates a
 * link, and returns Composio's hosted authorization URL plus the new
 * connected account id (for auto-import once the user returns).
 */
export async function initiateComposioConnection(
  env: Env,
  workspaceId: string,
  providerId: string,
  origin: string,
): Promise<ComposioLinkResult> {
  const support = getComposioSupport(providerId);
  if (!support) throw badRequest("This platform is not supported through Composio");
  const apiKey = await getComposioApiKey(env, workspaceId);
  if (!apiKey) throw badRequest("Configure the Composio API key first");

  // 1. Find an enabled auth config for the toolkit — or create a
  //    Composio-managed one ourselves, so the user never has to open the
  //    Composio dashboard at all.
  const cfgRes = await composioFetch<{ items?: AuthConfigItem[] }>(
    env,
    apiKey,
    `/auth_configs?toolkit_slug=${encodeURIComponent(support.toolkit)}&show_disabled=false`,
  );
  if (cfgRes.status !== 200 || !cfgRes.json) {
    throw badRequest(`Could not read Composio auth configs (HTTP ${cfgRes.status})`);
  }
  let config = (cfgRes.json.items ?? []).find((c) => (c.status ?? "ENABLED") === "ENABLED");

  if (!config) {
    const createRes = await composioFetch<{
      auth_config?: { id?: string };
      error?: { message?: string };
    }>(env, apiKey, "/auth_configs", {
      method: "POST",
      body: JSON.stringify({
        toolkit: { slug: support.toolkit },
        auth_config: {
          type: "use_composio_managed_auth",
          credentials: {},
          restrict_to_following_tools: [],
        },
      }),
    });
    const createdId = createRes.json?.auth_config?.id;
    if (createRes.status !== 201 || !createdId) {
      const message =
        createRes.json?.error?.message ??
        `Could not enable ${support.toolkit} through Composio (HTTP ${createRes.status})`;
      throw badRequest(message);
    }
    config = { id: createdId, status: "ENABLED" };
  }

  // 2. Create the link under the Postflare user with a callback back here.
  const callbackUrl = `${origin}/settings/integrations?composio=connected&provider=${encodeURIComponent(providerId)}`;
  const linkRes = await composioFetch<{
    redirect_url?: string;
    connected_account_id?: string;
    error?: { message?: string };
  }>(env, apiKey, "/connected_accounts/link", {
    method: "POST",
    body: JSON.stringify({
      auth_config_id: config.id,
      user_id: COMPOSIO_USER,
      callback_url: callbackUrl,
    }),
  });
  if (linkRes.status !== 201 || !linkRes.json?.redirect_url) {
    const message = linkRes.json?.error?.message ?? `Composio link failed (HTTP ${linkRes.status})`;
    throw badRequest(message);
  }

  return {
    redirectUrl: linkRes.json.redirect_url,
    composioAccountId: linkRes.json.connected_account_id ?? null,
    providerId,
  };
}

export interface ComposioRemoteAccount {
  id: string;
  toolkit: string;
  providerId: string | null;
  status: string;
  name: string;
  imported: boolean;
}

/** List Composio connected accounts that map to supported Postflare platforms. */
export async function listComposioAccounts(env: Env, workspaceId: string): Promise<ComposioRemoteAccount[]> {
  const apiKey = await getComposioApiKey(env, workspaceId);
  if (!apiKey) throw badRequest("Configure the Composio API key first");

  const res = await composioFetch<{ items?: (ComposioAccountItem & { user_id?: string })[] }>(
    env,
    apiKey,
    `/connected_accounts?limit=100&user_ids=${encodeURIComponent(COMPOSIO_USER)}`,
  );
  if (res.status !== 200 || !res.json) {
    throw badRequest(`Could not list Composio accounts (HTTP ${res.status})`);
  }

  const importedRows = await env.DB.prepare(
    "SELECT external_id FROM connected_accounts WHERE workspace_id = ? AND connection_mode = 'composio'",
  ).bind(workspaceId).all<{ external_id: string }>();
  const imported = new Set((importedRows.results ?? []).map((r) => r.external_id));

  const out: ComposioRemoteAccount[] = [];
  for (const item of res.json.items ?? []) {
    const support = COMPOSIO_SUPPORTED.find((s) => s.toolkit === item.toolkit?.slug);
    out.push({
      id: item.id,
      toolkit: item.toolkit?.slug ?? "",
      providerId: support?.platformId ?? null,
      status: item.status,
      name: item.alias || item.word_id || item.toolkit?.slug || item.id,
      imported: imported.has(item.id),
    });
  }
  return out;
}

export interface ImportComposioInput {
  composioAccountId: string;
  providerId: string;
  accountName?: string;
  config?: Record<string, string>;
}

/** Import a Composio connected account as a Postflare connected account. */
export async function importComposioAccount(
  env: Env,
  workspaceId: string,
  actorId: string,
  input: ImportComposioInput,
): Promise<{ accountId: string }> {
  const support = getComposioSupport(input.providerId);
  if (!support) throw badRequest("This platform is not supported through Composio");

  const apiKey = await getComposioApiKey(env, workspaceId);
  if (!apiKey) throw badRequest("Configure the Composio API key first");

  // Verify the account exists, is ACTIVE, and belongs to the right toolkit.
  const verify = await composioFetch<{ items?: ComposioAccountItem[] }>(
    env,
    apiKey,
    `/connected_accounts?connected_account_ids=${encodeURIComponent(input.composioAccountId)}`,
  );
  const item = verify.json?.items?.[0];
  if (verify.status !== 200 || !item) throw notFound("Composio account not found");
  if (item.toolkit?.slug !== support.toolkit) {
    throw badRequest(`This Composio account is for ${item.toolkit?.slug}, not ${support.toolkit}`);
  }
  if (item.status !== "ACTIVE") {
    throw badRequest(`Composio account status is ${item.status}; it must be ACTIVE to import`);
  }

  const existing = await env.DB.prepare(
    "SELECT id FROM connected_accounts WHERE workspace_id = ? AND connection_mode = 'composio' AND external_id = ?",
  ).bind(workspaceId, input.composioAccountId).first<{ id: string }>();
  if (existing) throw badRequest("This Composio account is already imported");

  // Required per-account config (Facebook pageId, Reddit subreddit, Telegram chatId).
  const config: Record<string, string> = {};
  for (const field of support.accountConfigFields) {
    const value = input.config?.[field.key]?.trim();
    if (field.required && !value) {
      throw badRequest(`${field.label} is required for ${support.platformId}`);
    }
    if (value) config[field.key] = value;
  }

  // LinkedIn requires an author URN on every post; resolve it once at import.
  if (support.needsAuthorUrn) {
    const authorUrn = await resolveLinkedInAuthorUrn(env, apiKey, input.composioAccountId);
    if (!authorUrn) {
      throw badRequest(
        "Could not resolve your LinkedIn author URN from Composio. The account was not imported.",
      );
    }
    config.authorUrn = authorUrn;
  }

  const id = randomId("acct");
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO connected_accounts
      (id, workspace_id, provider_id, credentials_id, external_id, account_name, username, avatar_url,
       status, is_default, token_expires_at, last_synced_at, last_error, connection_mode, config_json,
       created_at, updated_at)
     VALUES (?, ?, ?, NULL, ?, ?, ?, NULL, 'connected', 0, NULL, ?, NULL, 'composio', ?, ?, ?)`,
  ).bind(
    id,
    workspaceId,
    support.platformId,
    input.composioAccountId,
    input.accountName?.trim() || item.alias || item.word_id || support.platformId,
    item.word_id ?? null,
    now,
    JSON.stringify(config),
    now,
    now,
  ).run();
  void actorId;
  return { accountId: id };
}

async function resolveLinkedInAuthorUrn(env: Env, apiKey: string, accountId: string): Promise<string | null> {
  const res = await executeComposioTool(env, apiKey, "LINKEDIN_GET_MY_INFO", accountId, {});
  if (!res.successful) return null;
  const profile = typeof res.data === "string" ? safeJsonParse(res.data) : res.data;
  if (!profile || typeof profile !== "object") return null;
  const id = (profile as Record<string, unknown>).id ?? (profile as Record<string, unknown>).sub;
  if (typeof id !== "string" || !id) return null;
  return `urn:li:person:${id}`;
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

interface ToolExecution {
  successful: boolean;
  data: unknown;
  error: string | null;
}

async function executeComposioTool(
  env: Env,
  apiKey: string,
  toolSlug: string,
  connectedAccountId: string,
  args: Record<string, unknown>,
): Promise<ToolExecution> {
  const res = await composioFetch<ToolExecution>(env, apiKey, `/tools/execute/${toolSlug}`, {
    method: "POST",
    body: JSON.stringify({
      connected_account_id: connectedAccountId,
      arguments: args,
    }),
  });
  if (res.status !== 200 || !res.json) {
    const message = (res.json as { error?: { message?: string } } | null)?.error?.message
      ?? `Composio tool ${toolSlug} failed: HTTP ${res.status}`;
    return { successful: false, data: null, error: redactError(message) };
  }
  const body = res.json;
  if (!body.successful) {
    return { successful: false, data: null, error: redactError(body.error ?? "Tool execution failed") };
  }
  return body;
}

export interface ComposioPublishInput {
  platformId: string;
  composioAccountId: string;
  config: Record<string, string>;
  text: string;
  title?: string;
  link?: string;
  mediaUrls: string[];
  altText?: string;
}

/**
 * Publish through Composio. The API key is resolved by the caller
 * (publishing.ts), which owns the workspace context. Returns the standard
 * PublishResult so the queue pipeline records attempts/errors identically to
 * direct adapters.
 */
export async function composioPublishWithKey(
  env: Env,
  apiKey: string,
  input: ComposioPublishInput,
): Promise<PublishResult> {
  const support = getComposioSupport(input.platformId);
  if (!support) {
    return { ok: false, error: "This platform is not supported through Composio", errorCode: "unsupported", retryable: false };
  }
  const args = buildArguments(support, input);

  try {
    // Instagram: two-step — create the media container, then publish it.
    if (support.containerTool) {
      if (!input.mediaUrls.length) {
        return {
          ok: false,
          error: "Instagram publishing requires at least one image or video.",
          errorCode: "media_required",
          retryable: false,
        };
      }
      const container = await executeComposioTool(env, apiKey, support.containerTool, input.composioAccountId, args);
      if (!container.successful) {
        return { ok: false, error: container.error ?? "Container creation failed", errorCode: "publish_failed", retryable: true };
      }
      const creationId = extractId(container.data);
      if (!creationId) {
        return { ok: false, error: "Composio did not return a media container id", errorCode: "publish_failed", retryable: false };
      }
      const published = await executeComposioTool(env, apiKey, support.publishTool, input.composioAccountId, {
        ig_user_id: "me",
        creation_id: creationId,
      });
      if (!published.successful) {
        return { ok: false, error: published.error ?? "Publish failed", errorCode: "publish_failed", retryable: true };
      }
      return { ok: true, remoteId: extractId(published.data) ?? undefined, responseSummary: `composio:${support.publishTool}` };
    }

    const result = await executeComposioTool(env, apiKey, support.publishTool, input.composioAccountId, args);
    if (!result.successful) {
      return { ok: false, error: result.error ?? "Tool execution failed", errorCode: "publish_failed", retryable: true };
    }
    return { ok: true, remoteId: extractId(result.data) ?? undefined, responseSummary: `composio:${support.publishTool}` };
  } catch (e) {
    return { ok: false, error: redactError(e), errorCode: "publish_error", retryable: true };
  }
}

function buildArguments(support: ComposioSupport, input: ComposioPublishInput): Record<string, unknown> {
  const args: Record<string, unknown> = {};

  switch (support.platformId) {
    case "x":
      args[support.textParam] = input.text;
      break;
    case "instagram":
      args[support.textParam] = input.text;
      if (input.mediaUrls[0]) args.image_url = input.mediaUrls[0];
      if (input.altText) args.alt_text = input.altText;
      break;
    case "facebook":
      args[support.textParam] = input.text;
      args.page_id = input.config.pageId;
      if (input.link) args.link = input.link;
      break;
    case "linkedin":
      args[support.textParam] = input.text;
      args.author = input.config.authorUrn;
      break;
    case "threads": {
      args[support.textParam] = input.text;
      if (input.mediaUrls[0]) {
        args.media_type = "IMAGE";
        args.image_url = input.mediaUrls[0];
        if (input.altText) args.alt_text = input.altText;
      } else {
        args.media_type = "TEXT";
        if (input.link) args.link_attachment = input.link;
      }
      break;
    }
    case "reddit": {
      args[support.textParam!] = input.text;
      args[support.titleParam!] = (input.title || input.text).slice(0, 300);
      args.subreddit = input.config.subreddit;
      break;
    }
    case "telegram":
      args[support.textParam] = input.text;
      args.chat_id = input.config.chatId;
      break;
  }

  return args;
}

/** Pull an id out of a tool response payload (nested under `data` or raw). */
function extractId(data: unknown): string | null {
  if (!data) return null;
  const parsed = typeof data === "string" ? safeJsonParse(data) : data;
  if (parsed && typeof parsed === "object") {
    const record = parsed as Record<string, unknown>;
    for (const key of ["id", "media_id", "post_id", "creation_id", "data"]) {
      const value = record[key];
      if (typeof value === "string" && value) return value;
      if (value && typeof value === "object") {
        const nested = extractId(value);
        if (nested) return nested;
      }
    }
  }
  return null;
}

/** Test connectivity of an imported Composio-backed Postflare account. */
export async function testComposioAccount(
  env: Env,
  apiKey: string,
  composioAccountId: string,
): Promise<{ ok: boolean; message: string }> {
  const res = await composioFetch<{ items?: ComposioAccountItem[] }>(
    env,
    apiKey,
    `/connected_accounts?connected_account_ids=${encodeURIComponent(composioAccountId)}`,
  );
  const item = res.json?.items?.[0];
  if (res.status !== 200 || !item) return { ok: false, message: "Composio account not found" };
  if (item.status !== "ACTIVE") return { ok: false, message: `Composio account status is ${item.status}` };
  return { ok: true, message: "Composio account is active" };
}