import type { Env } from "../env";
import { randomId } from "../utils/id";
import { badRequest, notFound } from "../utils/http";
import { audit } from "./audit";

export type PlannerStatus = "idea" | "drafting" | "review" | "approved" | "done";

export const PLANNER_STATUSES: PlannerStatus[] = ["idea", "drafting", "review", "approved", "done"];

export interface PlannerItem {
  id: string;
  workspaceId: string;
  title: string;
  notes: string | null;
  platformId: string | null;
  status: PlannerStatus;
  tags: string[];
  campaignId: string | null;
  dueAt: string | null;
  postId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ItemRow {
  id: string;
  workspace_id: string;
  title: string;
  notes: string | null;
  platform_id: string | null;
  status: string;
  tags_json: string;
  campaign_id: string | null;
  due_at: string | null;
  post_id: string | null;
  created_at: string;
  updated_at: string;
}

function toItem(row: ItemRow): PlannerItem {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    notes: row.notes,
    platformId: row.platform_id,
    status: (PLANNER_STATUSES.includes(row.status as PlannerStatus) ? row.status : "idea") as PlannerStatus,
    tags: JSON.parse(row.tags_json) as string[],
    campaignId: row.campaign_id,
    dueAt: row.due_at,
    postId: row.post_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface ListPlannerFilter {
  status?: string;
  platformId?: string;
  campaignId?: string;
  search?: string;
  tag?: string;
}

export async function listPlannerItems(
  env: Env,
  workspaceId: string,
  filter: ListPlannerFilter,
): Promise<PlannerItem[]> {
  const conditions = ["workspace_id = ?", "deleted_at IS NULL"];
  const params: unknown[] = [workspaceId];
  if (filter.status) {
    const statuses = filter.status.split(",").map((s) => s.trim()).filter(Boolean);
    if (statuses.length) {
      conditions.push(`status IN (${statuses.map(() => "?").join(",")})`);
      params.push(...statuses);
    }
  }
  if (filter.platformId) {
    conditions.push("platform_id = ?");
    params.push(filter.platformId);
  }
  if (filter.campaignId) {
    conditions.push("campaign_id = ?");
    params.push(filter.campaignId);
  }
  if (filter.search) {
    conditions.push("(title LIKE ? OR notes LIKE ?)");
    params.push(`%${filter.search}%`, `%${filter.search}%`);
  }
  if (filter.tag) {
    conditions.push("tags_json LIKE ?");
    params.push(`%"${filter.tag.replace(/["%]/g, "")}"%`);
  }
  const rows = await env.DB.prepare(
    `SELECT * FROM content_items WHERE ${conditions.join(" AND ")} ORDER BY COALESCE(due_at, created_at) ASC`,
  ).bind(...params).all<ItemRow>();
  return (rows.results ?? []).map(toItem);
}

export async function getPlannerItem(env: Env, workspaceId: string, id: string): Promise<PlannerItem> {
  const row = await env.DB.prepare(
    "SELECT * FROM content_items WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL",
  ).bind(id, workspaceId).first<ItemRow>();
  if (!row) throw notFound("Planner item not found");
  return toItem(row);
}

export interface CreatePlannerInput {
  title: string;
  notes?: string | null;
  platformId?: string | null;
  campaignId?: string | null;
  tags?: string[];
  dueAt?: string | null;
  status?: PlannerStatus;
}

export async function createPlannerItem(
  env: Env,
  workspaceId: string,
  actorId: string,
  input: CreatePlannerInput,
): Promise<PlannerItem> {
  if (!input.title?.trim()) throw badRequest("A title is required");
  const id = randomId("idea");
  const now = new Date().toISOString();
  const status = input.status && PLANNER_STATUSES.includes(input.status) ? input.status : "idea";
  await env.DB.prepare(
    `INSERT INTO content_items (id, workspace_id, title, notes, platform_id, status, tags_json, campaign_id, due_at, post_id, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
  ).bind(
    id,
    workspaceId,
    input.title.trim(),
    input.notes ?? null,
    input.platformId ?? null,
    status,
    JSON.stringify(input.tags ?? []),
    input.campaignId ?? null,
    input.dueAt ?? null,
    actorId,
    now,
    now,
  ).run();
  await audit(env, workspaceId, actorId, "planner.create", "content_items", id, {});
  return getPlannerItem(env, workspaceId, id);
}

export interface UpdatePlannerInput {
  title?: string;
  notes?: string | null;
  platformId?: string | null;
  status?: PlannerStatus;
  campaignId?: string | null;
  tags?: string[];
  dueAt?: string | null;
}

export async function updatePlannerItem(
  env: Env,
  workspaceId: string,
  id: string,
  input: UpdatePlannerInput,
): Promise<PlannerItem> {
  await getPlannerItem(env, workspaceId, id); // 404 check + workspace scope
  if (input.status && !PLANNER_STATUSES.includes(input.status)) throw badRequest("Invalid status");
  if (input.title !== undefined && !input.title.trim()) throw badRequest("Title cannot be empty");

  const now = new Date().toISOString();
  const sets: string[] = ["updated_at = ?"];
  const params: unknown[] = [now];
  if (input.title !== undefined) { sets.push("title = ?"); params.push(input.title.trim()); }
  if (input.notes !== undefined) { sets.push("notes = ?"); params.push(input.notes ?? null); }
  if (input.platformId !== undefined) { sets.push("platform_id = ?"); params.push(input.platformId ?? null); }
  if (input.status !== undefined) { sets.push("status = ?"); params.push(input.status); }
  if (input.campaignId !== undefined) { sets.push("campaign_id = ?"); params.push(input.campaignId ?? null); }
  if (input.tags !== undefined) { sets.push("tags_json = ?"); params.push(JSON.stringify(input.tags)); }
  if (input.dueAt !== undefined) { sets.push("due_at = ?"); params.push(input.dueAt ?? null); }

  await env.DB.prepare(
    `UPDATE content_items SET ${sets.join(", ")} WHERE id = ? AND workspace_id = ?`,
  ).bind(...params, id, workspaceId).run();
  return getPlannerItem(env, workspaceId, id);
}

export async function deletePlannerItem(env: Env, workspaceId: string, id: string): Promise<void> {
  await getPlannerItem(env, workspaceId, id);
  await env.DB.prepare("UPDATE content_items SET deleted_at = ?, updated_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), new Date().toISOString(), id).run();
}

/**
 * Mark an idea converted: link it to its post and move it to the 'done'
 * column. Called by the post pipeline when a post is created from an idea.
 */
export async function markIdeaConverted(
  env: Env,
  workspaceId: string,
  ideaId: string,
  postId: string,
): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.prepare(
    "UPDATE content_items SET status = 'done', post_id = ?, updated_at = ? WHERE id = ? AND workspace_id = ?",
  ).bind(postId, now, ideaId, workspaceId).run();
}

/** Ideas + review counts for the overview dashboard. */
export async function plannerStats(
  env: Env,
  workspaceId: string,
): Promise<{ ideas: number; inReview: number; approved: number; done: number }> {
  const rows = await env.DB.prepare(
    `SELECT status, COUNT(*) AS n FROM content_items
      WHERE workspace_id = ? AND deleted_at IS NULL GROUP BY status`,
  ).bind(workspaceId).all<{ status: string; n: number }>();
  const by = Object.fromEntries((rows.results ?? []).map((r) => [r.status, r.n]));
  return {
    ideas: by.idea ?? 0,
    inReview: by.review ?? 0,
    approved: by.approved ?? 0,
    done: by.done ?? 0,
  };
}