import type { Env } from "../env";
import { getAdapter } from "../adapters/registry";
import { getCredentials } from "./credentials";
import { randomId } from "../utils/id";
import { notFound } from "../utils/http";

/** Store a metrics snapshot for an account (native platform metrics only). */
export async function recordAccountMetrics(
  env: Env,
  accountId: string,
  providerId: string,
  metricDate: string,
  metrics: Record<string, number>,
): Promise<void> {
  const row = await env.DB.prepare("SELECT id FROM connected_accounts WHERE id = ?").bind(accountId).first<{ id: string }>();
  if (!row) throw notFound("Account not found");
  await env.DB.prepare(
    `INSERT INTO account_metrics (id, account_id, provider_id, metric_date, metrics_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(account_id, provider_id, metric_date) DO UPDATE SET metrics_json = excluded.metrics_json`,
  ).bind(randomId("am"), accountId, providerId, metricDate, JSON.stringify(metrics), new Date().toISOString()).run();
}

export async function getAccountMetrics(
  env: Env,
  accountId: string,
  since: string | null,
): Promise<{ metricDate: string; metrics: Record<string, number> }[]> {
  const rows = await env.DB.prepare(
    "SELECT metric_date, metrics_json FROM account_metrics WHERE account_id = ? AND (? IS NULL OR metric_date >= ?) ORDER BY metric_date ASC",
  ).bind(accountId, since, since).all<{ metric_date: string; metrics_json: string }>();
  return (rows.results ?? []).map((r) => ({ metricDate: r.metric_date, metrics: JSON.parse(r.metrics_json) }));
}

/** Fetch fresh metrics from a provider that exposes them, and persist. */
export async function syncAccountMetrics(
  env: Env,
  workspaceId: string,
  accountId: string,
): Promise<{ ok: boolean; metrics: Record<string, number> | null; message: string }> {
  const account = await env.DB.prepare("SELECT provider_id FROM connected_accounts WHERE id = ? AND workspace_id = ?")
    .bind(accountId, workspaceId).first<{ provider_id: string }>();
  if (!account) throw notFound("Account not found");

  const adapter = getAdapter(account.provider_id);
  if (!adapter.getAnalytics) {
    return { ok: false, metrics: null, message: "This platform does not expose analytics through its API" };
  }
  const credentials = (await getCredentials(env, workspaceId, account.provider_id)) ?? {};
  const metrics = (await adapter.getAnalytics(credentials)) as Record<string, number> | null;
  if (!metrics) {
    return { ok: false, metrics: null, message: "No metrics available" };
  }
  const today = new Date().toISOString().slice(0, 10);
  await recordAccountMetrics(env, accountId, account.provider_id, today, metrics);
  return { ok: true, metrics, message: "Metrics synced" };
}