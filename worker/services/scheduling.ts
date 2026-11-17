import type { Env } from "../env";
import { enqueuePost } from "./publishing";
import { resumeAutomationExecutions } from "./automation";

/**
 * Cron entrypoint (runs every minute). Finds posts that are due and enqueues
 * publishing jobs, then resumes any automation executions whose delay has
 * elapsed. Never holds a Worker request open for a scheduled future time.
 */
export async function sweep(env: Env): Promise<{ enqueuedPosts: number; resumedExecutions: number }> {
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

  return { enqueuedPosts, resumedExecutions };
}