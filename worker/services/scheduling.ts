import type { Env } from "../env";
import { enqueuePost } from "./publishing";
import { resumeAutomationExecutions } from "./automation";

interface RetentionSettings {
  retentionDays?: number;
  metricsRetentionDays?: number;
}

/**
 * Cron entrypoint (runs every minute). Finds posts that are due and enqueues
 * publishing jobs, resumes any automation executions whose delay has elapsed,
 * and enforces workspace data-retention settings. Never holds a Worker request
 * open for a scheduled future time.
 */
export async function sweep(env: Env): Promise<{ enqueuedPosts: number; resumedExecutions: number; purged: number }> {
  const now = new Date().toISOString();

  const due = await env.DB.prepare(
    "SELECT id, workspace_id, created_by FROM posts WHERE status IN ('scheduled','approved') AND scheduled_for IS NOT NULL AND scheduled_for <= ? AND deleted_at IS NULL",
  ).bind(now).all<{ id: string; workspace_id: string; created_by: string }>();

  let enqueuedPosts = 0;
  for (const post of due.results ?? []) {
    try {
      await enqueuePost(env, post.workspace_id, post.id, post.created_by);
      enqueuedPosts += 1;
    } catch (e) {
      // A single failing post must not stop the sweep.
      await env.DB.prepare(
        "UPDATE posts SET status = 'failed', updated_at = ? WHERE id = ?",
      ).bind(now, post.id).run();
      void e;
    }
  }

  const resumedExecutions = await resumeAutomationExecutions(env);
  const purged = await enforceRetention(env);

  return { enqueuedPosts, resumedExecutions, purged };
}

/**
 * Enforce per-workspace retention settings (Settings → Data retention).
 *   retentionDays       — audit logs, publishing attempts, automation steps
 *   metricsRetentionDays — account/post metric snapshots
 * Deletes are workspace-scoped; rows without a workspace link are skipped.
 */
export async function enforceRetention(env: Env): Promise<number> {
  const rows = await env.DB.prepare(
    "SELECT workspace_id, settings_json FROM workspace_settings",
  ).all<{ workspace_id: string; settings_json: string }>();

  let purged = 0;
  for (const row of rows.results ?? []) {
    let settings: RetentionSettings = {};
    try {
      settings = JSON.parse(row.settings_json) as RetentionSettings;
    } catch {
      continue;
    }

    if (typeof settings.retentionDays === "number" && settings.retentionDays > 0) {
      const cutoff = new Date(Date.now() - settings.retentionDays * 86_400_000).toISOString();
      const ws = row.workspace_id;
      const results = await Promise.all([
        env.DB.prepare("DELETE FROM audit_logs WHERE workspace_id = ? AND created_at < ?").bind(ws, cutoff).run(),
        env.DB.prepare(
          "DELETE FROM publishing_attempts WHERE created_at < ? AND post_id IN (SELECT id FROM posts WHERE workspace_id = ?)",
        ).bind(cutoff, ws).run(),
        env.DB.prepare(
          "DELETE FROM automation_execution_steps WHERE started_at < ? AND execution_id IN (SELECT id FROM automation_executions WHERE workspace_id = ?)",
        ).bind(cutoff, ws).run(),
      ]);
      for (const r of results) purged += r.meta?.changes ?? 0;
    }

    if (typeof settings.metricsRetentionDays === "number" && settings.metricsRetentionDays > 0) {
      const cutoff = new Date(Date.now() - settings.metricsRetentionDays * 86_400_000).toISOString().slice(0, 10);
      const ws = row.workspace_id;
      const r = await env.DB.prepare(
        "DELETE FROM account_metrics WHERE metric_date < ? AND account_id IN (SELECT id FROM connected_accounts WHERE workspace_id = ?)",
      ).bind(cutoff, ws).run();
      purged += r.meta?.changes ?? 0;
    }
  }
  return purged;
}