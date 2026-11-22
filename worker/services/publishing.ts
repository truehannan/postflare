import type { Env } from "../env";
import { getAdapter } from "../adapters/registry";
import { randomId } from "../utils/id";
import { notFound } from "../utils/http";
import { getCredentials } from "./credentials";
import { absoluteMediaUrl } from "./media";
import { notify } from "./notifications";
import { audit } from "./audit";
import type { PostStatus } from "../../shared/types";

export interface QueueMessage {
  type: "publish";
  jobId: string;
}

/** Create a publishing job per pending account target and enqueue them. */
export async function enqueuePost(
  env: Env,
  workspaceId: string,
  postId: string,
  actorId: string,
): Promise<{ jobs: number }> {
  const post = await env.DB.prepare("SELECT id, status FROM posts WHERE id = ? AND workspace_id = ?")
    .bind(postId, workspaceId).first<{ id: string; status: string }>();
  if (!post) throw notFound("Post not found");

  const targets = await env.DB.prepare(
    "SELECT id, account_id, status FROM post_accounts WHERE post_id = ? AND status IN ('draft','scheduled','queued','failed','approved')",
  ).bind(postId).all<{ id: string; account_id: string; status: string }>();

  const now = new Date().toISOString();
  const jobs: string[] = [];

  for (const t of targets.results ?? []) {
    const jobId = randomId("job");
    await env.DB.prepare(
      "INSERT INTO publishing_jobs (id, post_id, account_id, run_at, status, attempts, max_attempts, idempotency_key, created_at, updated_at) VALUES (?, ?, ?, ?, 'queued', 0, 5, ?, ?, ?)",
    ).bind(jobId, postId, t.account_id, now, randomId("idem"), now, now).run();
    await env.DB.prepare("UPDATE post_accounts SET status = 'queued' WHERE id = ?").bind(t.id).run();
    jobs.push(jobId);
  }

  await env.DB.prepare("UPDATE posts SET status = 'queued', updated_at = ? WHERE id = ?").bind(now, postId).run();

  for (const jobId of jobs) {
    await env.PUBLISH_QUEUE.send({ type: "publish", jobId } satisfies QueueMessage);
  }

  await audit(env, workspaceId, actorId, "post.enqueue", "posts", postId, { jobs: jobs.length });
  return { jobs: jobs.length };
}

async function resolveMediaForTarget(
  env: Env,
  postId: string,
  providerId: string,
): Promise<string[]> {
  const rows = await env.DB.prepare(
    `SELECT m.r2_key, m.mime_type
       FROM post_variants v
       JOIN post_variant_media pvm ON pvm.variant_id = v.id
       JOIN media_assets m ON m.id = pvm.media_id
      WHERE v.post_id = ? AND v.provider_id = ? AND m.deleted_at IS NULL
      ORDER BY pvm.position`,
  ).bind(postId, providerId).all<{ r2_key: string; mime_type: string }>();
  return (rows.results ?? []).map((r) => absoluteMediaUrl(env, `/media/${r.r2_key}`));
}

/** Process a single publishing job (called from the Queue consumer). */
export async function publishJob(env: Env, jobId: string): Promise<void> {
  const job = await env.DB.prepare("SELECT * FROM publishing_jobs WHERE id = ?").bind(jobId)
    .first<{ id: string; post_id: string; account_id: string; status: string; attempts: number; max_attempts: number; idempotency_key: string }>();
  if (!job) return;
  if (job.status === "done" || job.status === "dead") return;

  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE publishing_jobs SET status = 'running', attempts = attempts + 1, updated_at = ? WHERE id = ?")
    .bind(now, jobId).run();

  const post = await env.DB.prepare("SELECT id, workspace_id FROM posts WHERE id = ?").bind(job.post_id)
    .first<{ id: string; workspace_id: string }>();
  // `job.account_id` is a connected_accounts id; resolve the exact post target
  // by (post_id, account_id).
  const target = await env.DB.prepare(
    "SELECT pa.id, pa.provider_id, a.workspace_id, a.connection_mode, a.external_id, a.config_json FROM post_accounts pa JOIN connected_accounts a ON a.id = pa.account_id WHERE pa.post_id = ? AND pa.account_id = ?",
  ).bind(job.post_id, job.account_id).first<{ id: string; provider_id: string; workspace_id: string; connection_mode: string | null; external_id: string | null; config_json: string | null }>();
  if (!post || !target) {
    await env.DB.prepare("UPDATE publishing_jobs SET status = 'dead', last_error = 'Missing post or target', updated_at = ? WHERE id = ?").bind(now, jobId).run();
    return;
  }

  const variant = await env.DB.prepare(
    "SELECT text, title, link, first_comment, location, alt_text FROM post_variants WHERE post_id = ? AND provider_id = ?",
  ).bind(job.post_id, target.provider_id)
    .first<{ text: string; title: string | null; link: string | null; first_comment: string | null; location: string | null; alt_text: string | null }>();

  await env.DB.prepare("UPDATE post_accounts SET status = 'publishing' WHERE id = ?").bind(target.id).run();
  await env.DB.prepare("UPDATE posts SET status = 'publishing', updated_at = ? WHERE id = ?").bind(now, job.post_id).run();

  const credentials = await getCredentials(env, target.workspace_id, target.provider_id);
  const adapter = getAdapter(target.provider_id);

  let result;
  if (target.connection_mode === "composio") {
    // Composio-backed account: publish by executing the mapped Composio tool.
    const { getComposioApiKey, composioPublishWithKey } = await import("./composio");
    const apiKey = await getComposioApiKey(env, target.workspace_id);
    if (!apiKey) {
      result = { ok: false, error: "Composio API key is not configured", errorCode: "missing_credentials", retryable: false };
    } else {
      try {
        const mediaUrls = await resolveMediaForTarget(env, job.post_id, target.provider_id);
        result = await composioPublishWithKey(env, apiKey, {
          platformId: target.provider_id,
          composioAccountId: target.external_id ?? "",
          config: target.config_json ? JSON.parse(target.config_json) : {},
          text: variant?.text ?? "",
          title: variant?.title ?? undefined,
          link: variant?.link ?? undefined,
          mediaUrls,
          altText: variant?.alt_text ?? undefined,
        });
      } catch (e) {
        result = { ok: false, error: e instanceof Error ? e.message : String(e), errorCode: "publish_error", retryable: false };
      }
    }
  } else if (!adapter.publishPost) {
    result = { ok: false, error: "This provider does not support publishing", errorCode: "unsupported", retryable: false };
  } else {
    try {
      const mediaUrls = await resolveMediaForTarget(env, job.post_id, target.provider_id);
      result = await adapter.publishPost(credentials ?? {}, {
        text: variant?.text ?? "",
        title: variant?.title ?? undefined,
        link: variant?.link ?? undefined,
        mediaUrls,
        options: {
          altText: variant?.alt_text ?? undefined,
          firstComment: variant?.first_comment ?? undefined,
          location: variant?.location ?? undefined,
        },
      });
    } catch (e) {
      result = { ok: false, error: e instanceof Error ? e.message : String(e), errorCode: "publish_error", retryable: false };
    }
  }

  // Record the attempt (redacting sensitive values).
  await env.DB.prepare(
    "INSERT INTO publishing_attempts (id, job_id, post_id, account_id, provider_id, status, response_summary, error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(
    randomId("att"), jobId, job.post_id, job.account_id, target.provider_id,
    result.ok ? "success" : "failed",
    result.responseSummary ?? null,
    result.error ? String(result.error).slice(0, 500) : null,
    now,
  ).run();

  if (result.ok) {
    await env.DB.prepare(
      "UPDATE post_accounts SET status = 'published', remote_id = ?, published_at = ?, error = NULL WHERE id = ?",
    ).bind(result.remoteId ?? null, now, target.id).run();
    await env.DB.prepare("UPDATE publishing_jobs SET status = 'done', last_error = NULL, updated_at = ? WHERE id = ?").bind(now, jobId).run();
  } else {
    const retryable = result.retryable !== false && job.attempts < job.max_attempts;
    await env.DB.prepare(
      "UPDATE post_accounts SET status = 'failed', error = ? WHERE id = ?",
    ).bind(String(result.error).slice(0, 500), target.id).run();
    if (retryable) {
      await env.DB.prepare(
        "UPDATE publishing_jobs SET status = 'queued', last_error = ?, updated_at = ? WHERE id = ?",
      ).bind(String(result.error).slice(0, 500), now, jobId).run();
      // Re-enqueue with backoff handled by the queue's retry policy.
      await env.PUBLISH_QUEUE.send({ type: "publish", jobId } satisfies QueueMessage);
    } else {
      await env.DB.prepare("UPDATE publishing_jobs SET status = 'dead', last_error = ?, updated_at = ? WHERE id = ?")
        .bind(String(result.error).slice(0, 500), now, jobId).run();
    }
  }

  await recomputePostStatus(env, job.post_id);

  if (!result.ok && !result.retryable) {
    await notify(env, {
      workspaceId: post.workspace_id,
      type: "post.failed",
      title: "Post failed to publish",
      body: `${target.provider_id}: ${String(result.error).slice(0, 200)}`,
    });
  }
}

/** Derive the aggregate post status from its account targets. */
export async function recomputePostStatus(env: Env, postId: string): Promise<PostStatus> {
  const rows = await env.DB.prepare("SELECT status FROM post_accounts WHERE post_id = ?").bind(postId)
    .all<{ status: string }>();
  const statuses = (rows.results ?? []).map((r) => r.status);
  const now = new Date().toISOString();

  let next: PostStatus;
  if (statuses.length === 0) {
    next = "draft";
  } else if (statuses.every((s) => s === "published")) {
    next = "published";
  } else if (statuses.some((s) => s === "published") && statuses.some((s) => s === "failed")) {
    next = "partially_published";
  } else if (statuses.some((s) => s === "published")) {
    next = "publishing";
  } else if (statuses.every((s) => s === "failed")) {
    next = "failed";
  } else if (statuses.includes("publishing") || statuses.includes("queued")) {
    next = "publishing";
  } else {
    next = "queued";
  }

  await env.DB.prepare("UPDATE posts SET status = ?, updated_at = ? WHERE id = ?").bind(next, now, postId).run();

  if (next === "published" || next === "partially_published") {
    const post = await env.DB.prepare("SELECT workspace_id FROM posts WHERE id = ?").bind(postId).first<{ workspace_id: string }>();
    if (post) {
      await notify(env, { workspaceId: post.workspace_id, type: "post.published", title: "Post published", body: "Your post finished publishing." });
    }
  }
  return next;
}

export async function cancelPost(env: Env, workspaceId: string, postId: string, actorId: string): Promise<void> {
  const post = await env.DB.prepare("SELECT id, status FROM posts WHERE id = ? AND workspace_id = ?")
    .bind(postId, workspaceId).first<{ id: string; status: string }>();
  if (!post) throw notFound("Post not found");
  if (["published", "partially_published"].includes(post.status)) throw new Error("Cannot cancel an already-published post");
  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE posts SET status = 'cancelled', updated_at = ? WHERE id = ?").bind(now, postId).run();
  await env.DB.prepare("UPDATE post_accounts SET status = 'cancelled' WHERE post_id = ? AND status IN ('queued','publishing','scheduled','draft')").bind(postId).run();
  await env.DB.prepare("UPDATE publishing_jobs SET status = 'dead', updated_at = ? WHERE post_id = ? AND status IN ('queued','running')").bind(now, postId).run();
  await audit(env, workspaceId, actorId, "post.cancel", "posts", postId, {});
}