import type { Env } from "../env";
import { randomId } from "../utils/id";
import { badRequest, forbidden, notFound } from "../utils/http";
import { randomBase64 } from "../utils/base64";
import { audit } from "./audit";
import { ROLES } from "../middleware/workspace";

export async function listMembers(env: Env, workspaceId: string) {
  const rows = await env.DB.prepare(
    `SELECT wm.id, wm.role, wm.created_at, u.id AS user_id, u.email, u.name, u.avatar_url
       FROM workspace_members wm JOIN users u ON u.id = wm.user_id
      WHERE wm.workspace_id = ? ORDER BY wm.created_at ASC`,
  ).bind(workspaceId).all<Record<string, unknown>>();
  return (rows.results ?? []).map((r) => ({
    id: r.id as string,
    userId: r.user_id as string,
    workspaceId,
    role: r.role as string,
    user: { id: r.user_id as string, email: r.email as string, name: r.name as string, avatarUrl: r.avatar_url as string | null, createdAt: r.created_at as string },
    createdAt: r.created_at as string,
  }));
}

export async function inviteMember(
  env: Env,
  workspaceId: string,
  actorId: string,
  email: string,
  role: string,
): Promise<{ id: string; email: string }> {
  if (!ROLES.includes(role as (typeof ROLES)[number])) throw badRequest("Invalid role");
  const normalized = email.trim().toLowerCase();

  const existingUser = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(normalized).first<{ id: string }>();
  const existingMember = existingUser
    ? await env.DB.prepare("SELECT id FROM workspace_members WHERE workspace_id = ? AND user_id = ?").bind(workspaceId, existingUser.id).first()
    : null;
  if (existingMember) throw badRequest("This user is already a member");

  const id = randomId("inv");
  const token = randomBase64(24);
  await env.DB.prepare(
    "INSERT INTO workspace_invitations (id, workspace_id, email, role, token, status, expires_at, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)",
  ).bind(id, workspaceId, normalized, role, token, new Date(Date.now() + 7 * 24 * 3600_000).toISOString(), new Date().toISOString()).run();
  await audit(env, workspaceId, actorId, "team.invite", "workspace_invitations", id, { email, role });
  return { id, email: normalized };
}

export async function listInvitations(env: Env, workspaceId: string) {
  const rows = await env.DB.prepare(
    "SELECT id, email, role, status, created_at FROM workspace_invitations WHERE workspace_id = ? AND status = 'pending' ORDER BY created_at DESC",
  ).bind(workspaceId).all<Record<string, unknown>>();
  return rows.results ?? [];
}

export async function removeMember(env: Env, workspaceId: string, memberId: string, actorId: string): Promise<void> {
  const member = await env.DB.prepare("SELECT user_id, role FROM workspace_members WHERE id = ? AND workspace_id = ?")
    .bind(memberId, workspaceId).first<{ user_id: string; role: string }>();
  if (!member) throw notFound("Member not found");
  if (member.role === "owner") throw forbidden("The workspace owner cannot be removed");
  await env.DB.prepare("DELETE FROM workspace_members WHERE id = ?").bind(memberId).run();
  await audit(env, workspaceId, actorId, "team.remove", "workspace_members", memberId, { userId: member.user_id });
}

export async function updateRole(env: Env, workspaceId: string, memberId: string, role: string, actorId: string): Promise<void> {
  if (!ROLES.includes(role as (typeof ROLES)[number])) throw badRequest("Invalid role");
  const member = await env.DB.prepare("SELECT user_id, role FROM workspace_members WHERE id = ? AND workspace_id = ?")
    .bind(memberId, workspaceId).first<{ user_id: string; role: string }>();
  if (!member) throw notFound("Member not found");
  if (member.role === "owner") throw forbidden("The workspace owner's role cannot be changed");
  await env.DB.prepare("UPDATE workspace_members SET role = ? WHERE id = ?").bind(role, memberId).run();
  await audit(env, workspaceId, actorId, "team.role", "workspace_members", memberId, { role });
}