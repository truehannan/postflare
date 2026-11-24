import type { Env } from "../env";
import { getPlatform } from "../../shared/capabilities";
import { compileSimpleFlow, type SimpleAutomation } from "../../shared/automation";
import { randomId } from "../utils/id";
import { badRequest, notFound } from "../utils/http";
import { enqueuePost } from "./publishing";
import { createAutomation, publishAutomation, getTemplate, validateSimpleAutomation } from "./automation";
import { audit } from "./audit";
import type { Post, PostStatus, PostVariant, PostAccountTarget } from "../../shared/types";

export interface CreatePostInput {
  variants: {
    providerId: string;
    text: string;
    title?: string | null;
    link?: string | null;
    mediaIds: string[];
    firstComment?: string | null;
    location?: string | null;
    altText?: string | null;
  }[];
  accountIds: string[];
  scheduledFor?: string | null;
  publishNow?: boolean;
  campaignId?: string | null;
  /** Quick-attach template ids; each is instantiated, published and bound to this post. */
  attachTemplateIds?: string[];
  /** Templates with per-post customizations; the override applies to this post only. */
  attachTemplates?: { templateId: string; simple?: SimpleAutomation }[];
  /** Existing published automation ids to attach to this post. */
  attachAutomationIds?: string[];
}

export interface PostFilter {
  status?: string;
  providerId?: string;
  campaignId?: string;
  limit: number;
  cursor: string | null;
}

const STATUS_TRANSITIONS: Record<string, PostStatus[]> = {
  draft: ["scheduled", "awaiting_approval", "cancelled"],
  scheduled: ["draft", "cancelled"],
  awaiting_approval: ["approved", "scheduled", "draft", "cancelled"],
  approved: ["scheduled", "cancelled"],
  failed: ["scheduled", "draft", "cancelled"],
};

export async function createPost(env: Env, workspaceId: string, actorId: string, input: CreatePostInput): Promise<Post> {
  if (!input.variants.length) throw badRequest("At least one platform variant is required");
  const now = new Date().toISOString();

  const postId = randomId("post");
  let status: PostStatus = "draft";
  let scheduledFor = input.scheduledFor ?? null;
  if (input.publishNow) {
    scheduledFor = now;
    status = "queued";
  } else if (scheduledFor) {
    if (new Date(scheduledFor).getTime() <= Date.now()) throw badRequest("Scheduled time must be in the future");
    status = "scheduled";
  }

  await env.DB.prepare(
    "INSERT INTO posts (id, workspace_id, status, scheduled_for, campaign_id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(postId, workspaceId, status, scheduledFor, input.campaignId ?? null, actorId, now, now).run();

  // Validate accounts belong to the workspace and build provider -> account map.
  const accountRows = input.accountIds.length
    ? await env.DB.prepare(
        `SELECT id, provider_id FROM connected_accounts WHERE workspace_id = ? AND id IN (${input.accountIds.map(() => "?").join(",")})`,
      ).bind(workspaceId, ...input.accountIds).all<{ id: string; provider_id: string }>()
    : { results: [] as { id: string; provider_id: string }[] };

  const accounts = accountRows.results ?? [];
  if (accounts.length !== input.accountIds.length) throw badRequest("One or more selected accounts are invalid");

  const baseVariant = input.variants[0];
  const byProvider = new Map(input.variants.map((v) => [v.providerId, v]));

  // Ensure every targeted provider has a variant (fall back to the base text).
  for (const account of accounts) {
    if (!byProvider.has(account.provider_id)) {
      byProvider.set(account.provider_id, { providerId: account.provider_id, text: baseVariant.text, mediaIds: [] });
    }
  }

  // Persist variants + variant media.
  for (const v of byProvider.values()) {
    if (!getPlatform(v.providerId)) throw badRequest(`Unknown platform: ${v.providerId}`);
    const variantId = randomId("var");
    await env.DB.prepare(
      "INSERT INTO post_variants (id, post_id, provider_id, text, title, link, first_comment, location, alt_text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(variantId, postId, v.providerId, v.text, v.title ?? null, v.link ?? null, v.firstComment ?? null, v.location ?? null, v.altText ?? null, now).run();
    for (let i = 0; i < v.mediaIds.length; i++) {
      await env.DB.prepare(
        "INSERT INTO post_variant_media (id, variant_id, media_id, position) VALUES (?, ?, ?, ?)",
      ).bind(randomId("pvm"), variantId, v.mediaIds[i], i).run();
    }
  }

  // Persist account targets.
  for (const account of accounts) {
    await env.DB.prepare(
      "INSERT INTO post_accounts (id, post_id, account_id, provider_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(randomId("pa"), postId, account.id, account.provider_id, status === "queued" ? "queued" : "draft", now).run();
  }

  await audit(env, workspaceId, actorId, "post.create", "posts", postId, { status, accounts: accounts.length });

  if (input.publishNow) {
    await enqueuePost(env, workspaceId, postId, actorId);
  }

  // Quick automation attachments: instantiate each template, publish it and
  // bind it to this post (the comment-to-DM style flows run per post).
  // `simple` overrides are per-post customizations from the composer — the
  // template itself is never modified.
  const templateEntries: { templateId: string; simple?: SimpleAutomation }[] = [
    ...(input.attachTemplateIds ?? []).map((templateId) => ({ templateId })),
    ...(input.attachTemplates ?? []),
  ];
  for (const entry of templateEntries) {
    const template = await getTemplate(env, workspaceId, entry.templateId);
    if (!template) throw badRequest(`Unknown automation template: ${entry.templateId}`);
    const simple = entry.simple ?? template.simple;
    validateSimpleAutomation(simple);
    const definition = { ...compileSimpleFlow(simple), simple };
    const automation = await createAutomation(env, workspaceId, actorId, {
      name: `${template.name} — ${postId.slice(-6)}`,
      triggerType: simple.triggerType,
      triggerConfig: { ...simple.triggerConfig, postId },
      definition,
    });
    await publishAutomation(env, workspaceId, automation.id, definition, actorId);
    await env.DB.prepare(
      "INSERT INTO post_automations (id, post_id, automation_id, created_at) VALUES (?, ?, ?, ?)",
    ).bind(randomId("pa_link"), postId, automation.id, new Date().toISOString()).run();
  }

  // Attach existing published automations to this post.
  for (const automationId of input.attachAutomationIds ?? []) {
    const row = await env.DB.prepare(
      "SELECT id, status FROM automations WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL",
    ).bind(automationId, workspaceId).first<{ id: string; status: string }>();
    if (!row) throw badRequest(`Unknown automation: ${automationId}`);
    if (row.status !== "published") throw badRequest("Automations must be published before attaching");
    await env.DB.prepare(
      "INSERT OR IGNORE INTO post_automations (id, post_id, automation_id, created_at) VALUES (?, ?, ?, ?)",
    ).bind(randomId("pa_link"), postId, automationId, new Date().toISOString()).run();
  }

  return (await getPost(env, workspaceId, postId))!;
}

export async function getPost(env: Env, workspaceId: string, postId: string): Promise<Post | null> {
  const row = await env.DB.prepare("SELECT * FROM posts WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL")
    .bind(postId, workspaceId).first<Record<string, unknown>>();
  if (!row) return null;
  return hydratePost(env, row);
}

async function hydratePost(env: Env, row: Record<string, unknown>): Promise<Post> {
  const postId = row.id as string;
  const [variants, targets] = await Promise.all([
    env.DB.prepare(
      `SELECT v.id, v.provider_id, v.text, v.title, v.link, v.first_comment, v.location, v.alt_text,
              (SELECT json_group_array(pvm.media_id) FROM post_variant_media pvm WHERE pvm.variant_id = v.id) AS media_ids
         FROM post_variants v WHERE v.post_id = ? ORDER BY v.created_at`,
    ).bind(postId).all<{ id: string; provider_id: string; text: string; title: string | null; link: string | null; first_comment: string | null; location: string | null; alt_text: string | null; media_ids: string | null }>(),
    env.DB.prepare(
      "SELECT id, account_id, provider_id, status, remote_id, error, published_at FROM post_accounts WHERE post_id = ? ORDER BY created_at",
    ).bind(postId).all<Record<string, unknown>>(),
  ]);

  const variantList: PostVariant[] = (variants.results ?? []).map((v) => ({
    id: v.id,
    providerId: v.provider_id,
    text: v.text,
    title: v.title,
    link: v.link,
    mediaIds: v.media_ids ? (JSON.parse(v.media_ids) as string[]) : [],
    firstComment: v.first_comment,
    location: v.location,
    altText: v.alt_text,
  }));

  const targetList: PostAccountTarget[] = (targets.results ?? []).map((t) => ({
    id: t.id as string,
    accountId: t.account_id as string,
    providerId: t.provider_id as string,
    status: t.status as PostStatus,
    remoteId: t.remote_id as string | null,
    error: t.error as string | null,
    publishedAt: t.published_at as string | null,
  }));

  return {
    id: postId,
    workspaceId: row.workspace_id as string,
    status: row.status as PostStatus,
    scheduledFor: row.scheduled_for as string | null,
    createdById: row.created_by as string,
    campaignId: row.campaign_id as string | null,
    variants: variantList,
    targets: targetList,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function listPosts(env: Env, workspaceId: string, filter: PostFilter): Promise<{ items: Post[]; nextCursor: string | null }> {
  const conditions = ["workspace_id = ?", "deleted_at IS NULL"];
  const params: unknown[] = [workspaceId];
  if (filter.status) {
    conditions.push("status = ?");
    params.push(filter.status);
  }
  if (filter.campaignId) {
    conditions.push("campaign_id = ?");
    params.push(filter.campaignId);
  }
  if (filter.cursor) {
    conditions.push("created_at < (SELECT created_at FROM posts WHERE id = ?)");
    params.push(filter.cursor);
  }
  const where = conditions.join(" AND ");
  const rows = await env.DB.prepare(
    `SELECT * FROM posts WHERE ${where} ORDER BY created_at DESC LIMIT ${filter.limit + 1}`,
  ).bind(...params).all<Record<string, unknown>>();

  const results = rows.results ?? [];
  const hasMore = results.length > filter.limit;
  const page = hasMore ? results.slice(0, filter.limit) : results;
  const items = await Promise.all(page.map((r) => hydratePost(env, r)));
  return { items, nextCursor: hasMore ? page[page.length - 1].id as string : null };
}

export async function updatePostStatus(
  env: Env,
  workspaceId: string,
  postId: string,
  nextStatus: PostStatus,
  actorId: string,
): Promise<Post> {
  const post = await env.DB.prepare("SELECT id, status FROM posts WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL")
    .bind(postId, workspaceId).first<{ id: string; status: string }>();
  if (!post) throw notFound("Post not found");

  const allowed = STATUS_TRANSITIONS[post.status];
  if (!allowed?.includes(nextStatus)) {
    throw badRequest(`Cannot move a post from '${post.status}' to '${nextStatus}'`);
  }

  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE posts SET status = ?, updated_at = ? WHERE id = ?").bind(nextStatus, now, postId).run();
  await audit(env, workspaceId, actorId, "post.status", "posts", postId, { from: post.status, to: nextStatus });

  if (nextStatus === "scheduled") {
    await enqueuePost(env, workspaceId, postId, actorId);
  }
  return (await getPost(env, workspaceId, postId))!;
}

export async function deletePost(env: Env, workspaceId: string, postId: string, actorId: string): Promise<void> {
  const post = await env.DB.prepare("SELECT id, status FROM posts WHERE id = ? AND workspace_id = ?")
    .bind(postId, workspaceId).first<{ id: string; status: string }>();
  if (!post) throw notFound("Post not found");
  if (["publishing", "queued"].includes(post.status)) {
    throw badRequest("Cancel the post before deleting it");
  }
  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE posts SET deleted_at = ? WHERE id = ?").bind(now, postId).run();
  await audit(env, workspaceId, actorId, "post.delete", "posts", postId, {});
}