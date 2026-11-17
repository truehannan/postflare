import type { Env } from "../env";
import { randomId } from "../utils/id";
import { notFound, badRequest } from "../utils/http";
import { notify } from "./notifications";
import { audit } from "./audit";
import type { Approval, ApprovalStatus } from "../../shared/types";

export async function requestApproval(env: Env, workspaceId: string, postId: string, requesterId: string): Promise<Approval> {
  const post = await env.DB.prepare("SELECT id FROM posts WHERE id = ? AND workspace_id = ?").bind(postId, workspaceId).first<{ id: string }>();
  if (!post) throw notFound("Post not found");

  const existing = await env.DB.prepare("SELECT id FROM approvals WHERE post_id = ? AND status = 'pending'").bind(postId).first<{ id: string }>();
  if (existing) throw badRequest("An approval request already exists for this post");

  const id = randomId("appr");
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO approvals (id, workspace_id, post_id, requested_by, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)",
  ).bind(id, workspaceId, postId, requesterId, now).run();
  await env.DB.prepare("UPDATE posts SET status = 'awaiting_approval', updated_at = ? WHERE id = ?").bind(now, postId).run();
  await env.DB.prepare(
    "INSERT INTO approval_history (id, approval_id, actor_id, action, created_at) VALUES (?, ?, ?, 'requested', ?)",
  ).bind(randomId("ah"), id, requesterId, now).run();
  await notify(env, { workspaceId, type: "approval.requested", title: "Approval requested", body: "A post is awaiting review." });
  await audit(env, workspaceId, requesterId, "approval.request", "approvals", id, { postId });
  return (await getApproval(env, workspaceId, id))!;
}

export async function getApproval(env: Env, workspaceId: string, approvalId: string): Promise<Approval | null> {
  const row = await env.DB.prepare("SELECT * FROM approvals WHERE id = ? AND workspace_id = ?")
    .bind(approvalId, workspaceId).first<Record<string, unknown>>();
  if (!row) return null;
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    postId: row.post_id as string,
    requestedById: row.requested_by as string,
    reviewerId: row.reviewer_id as string | null,
    status: row.status as ApprovalStatus,
    comment: row.comment as string | null,
    createdAt: row.created_at as string,
    resolvedAt: row.resolved_at as string | null,
  };
}

export async function listApprovals(env: Env, workspaceId: string, status?: string): Promise<Approval[]> {
  const rows = status
    ? await env.DB.prepare("SELECT * FROM approvals WHERE workspace_id = ? AND status = ? ORDER BY created_at DESC").bind(workspaceId, status).all<Record<string, unknown>>()
    : await env.DB.prepare("SELECT * FROM approvals WHERE workspace_id = ? ORDER BY created_at DESC").bind(workspaceId).all<Record<string, unknown>>();
  return (rows.results ?? []).map((r) => ({
    id: r.id as string,
    workspaceId: r.workspace_id as string,
    postId: r.post_id as string,
    requestedById: r.requested_by as string,
    reviewerId: r.reviewer_id as string | null,
    status: r.status as ApprovalStatus,
    comment: r.comment as string | null,
    createdAt: r.created_at as string,
    resolvedAt: r.resolved_at as string | null,
  }));
}

export async function resolveApproval(
  env: Env,
  workspaceId: string,
  approvalId: string,
  action: "approve" | "reject" | "request_changes",
  comment: string | null,
  reviewerId: string,
): Promise<Approval> {
  const approval = await getApproval(env, workspaceId, approvalId);
  if (!approval) throw notFound("Approval not found");
  if (approval.status !== "pending") throw badRequest("Approval already resolved");

  const now = new Date().toISOString();
  const status: ApprovalStatus = action === "approve" ? "approved" : action === "reject" ? "rejected" : "changes_requested";
  await env.DB.prepare("UPDATE approvals SET status = ?, reviewer_id = ?, comment = ?, resolved_at = ? WHERE id = ?")
    .bind(status, reviewerId, comment ?? null, now, approvalId).run();
  await env.DB.prepare(
    "INSERT INTO approval_history (id, approval_id, actor_id, action, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).bind(randomId("ah"), approvalId, reviewerId, action, comment ?? null, now).run();

  if (action === "approve") {
    await env.DB.prepare("UPDATE posts SET status = 'approved', updated_at = ? WHERE id = ?").bind(now, approval.postId).run();
  } else {
    await env.DB.prepare("UPDATE posts SET status = 'draft', updated_at = ? WHERE id = ?").bind(now, approval.postId).run();
  }
  await notify(env, { workspaceId, userId: approval.requestedById, type: "approval.resolved", title: `Approval ${status.replace("_", " ")}`, body: comment ?? undefined });
  await audit(env, workspaceId, reviewerId, "approval.resolve", "approvals", approvalId, { action });
  return (await getApproval(env, workspaceId, approvalId))!;
}