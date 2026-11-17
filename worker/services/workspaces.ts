import type { Env } from "../env";
import { randomId } from "../utils/id";
import { badRequest, notFound } from "../utils/http";
import { audit } from "./audit";

export async function listWorkspaces(env: Env, userId: string) {
  const rows = await env.DB.prepare(
    `SELECT w.id, w.name, w.slug, w.timezone, w.plan, w.created_at, wm.role
       FROM workspace_members wm JOIN workspaces w ON w.id = wm.workspace_id
      WHERE wm.user_id = ? ORDER BY w.created_at ASC`,
  ).bind(userId).all<Record<string, unknown>>();
  return (rows.results ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    slug: r.slug as string,
    timezone: r.timezone as string,
    plan: r.plan as string,
    role: r.role as string,
    createdAt: r.created_at as string,
  }));
}

export async function createWorkspace(env: Env, userId: string, name: string): Promise<{ id: string; name: string }> {
  if (!name.trim()) throw badRequest("Workspace name is required");
  const id = randomId("ws");
  const slug = `${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${id.slice(-6)}`;
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO workspaces (id, name, slug, timezone, plan, created_at, updated_at) VALUES (?, ?, ?, 'UTC', 'free', ?, ?)")
      .bind(id, name.trim(), slug, now, now),
    env.DB.prepare("INSERT INTO workspace_members (id, workspace_id, user_id, role, created_at) VALUES (?, ?, ?, 'owner', ?)")
      .bind(randomId("wm"), id, userId, now),
    env.DB.prepare("INSERT INTO workspace_settings (id, workspace_id, settings_json, updated_at) VALUES (?, ?, '{}', ?)")
      .bind(randomId("ws_set"), id, now),
  ]);
  await audit(env, id, userId, "workspace.create", "workspaces", id, {});
  return { id, name: name.trim() };
}

export async function getWorkspace(env: Env, userId: string, workspaceId: string) {
  const row = await env.DB.prepare(
    `SELECT w.*, wm.role FROM workspaces w JOIN workspace_members wm ON wm.workspace_id = w.id
      WHERE w.id = ? AND wm.user_id = ?`,
  ).bind(workspaceId, userId).first<Record<string, unknown>>();
  if (!row) throw notFound("Workspace not found");
  return row;
}

export async function getSettings(env: Env, workspaceId: string): Promise<Record<string, unknown>> {
  const row = await env.DB.prepare("SELECT settings_json FROM workspace_settings WHERE workspace_id = ?")
    .bind(workspaceId).first<{ settings_json: string }>();
  return row ? JSON.parse(row.settings_json) : {};
}

export async function updateSettings(env: Env, workspaceId: string, settings: Record<string, unknown>, actorId: string): Promise<Record<string, unknown>> {
  await env.DB.prepare(
    "INSERT INTO workspace_settings (id, workspace_id, settings_json, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(workspace_id) DO UPDATE SET settings_json = excluded.settings_json, updated_at = excluded.updated_at",
  ).bind(randomId("ws_set"), workspaceId, JSON.stringify(settings), new Date().toISOString()).run();
  await audit(env, workspaceId, actorId, "workspace.settings", "workspace_settings", workspaceId, {});
  return settings;
}