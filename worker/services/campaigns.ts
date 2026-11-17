import type { Env } from "../env";
import { randomId } from "../utils/id";
import { badRequest, notFound } from "../utils/http";
import { audit } from "./audit";
import type { Campaign } from "../../shared/types";

export interface CampaignInput {
  name: string;
  description?: string | null;
  objective?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

function mapCampaign(row: Record<string, unknown>): Campaign {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    name: row.name as string,
    description: row.description as string | null,
    objective: row.objective as string | null,
    startDate: row.start_date as string | null,
    endDate: row.end_date as string | null,
    createdAt: row.created_at as string,
  };
}

export async function createCampaign(env: Env, workspaceId: string, actorId: string, input: CampaignInput): Promise<Campaign> {
  if (!input.name.trim()) throw badRequest("Campaign name is required");
  const id = randomId("camp");
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO campaigns (id, workspace_id, name, description, objective, start_date, end_date, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(id, workspaceId, input.name.trim(), input.description ?? null, input.objective ?? null, input.startDate ?? null, input.endDate ?? null, actorId, now).run();
  await audit(env, workspaceId, actorId, "campaign.create", "campaigns", id, {});
  return (await getCampaign(env, workspaceId, id))!;
}

export async function getCampaign(env: Env, workspaceId: string, campaignId: string): Promise<Campaign | null> {
  const row = await env.DB.prepare("SELECT * FROM campaigns WHERE id = ? AND workspace_id = ?")
    .bind(campaignId, workspaceId).first<Record<string, unknown>>();
  return row ? mapCampaign(row) : null;
}

export async function listCampaigns(env: Env, workspaceId: string): Promise<Campaign[]> {
  const rows = await env.DB.prepare("SELECT * FROM campaigns WHERE workspace_id = ? ORDER BY created_at DESC")
    .bind(workspaceId).all<Record<string, unknown>>();
  return (rows.results ?? []).map(mapCampaign);
}

export async function updateCampaign(env: Env, workspaceId: string, campaignId: string, input: CampaignInput): Promise<Campaign> {
  const existing = await env.DB.prepare("SELECT id FROM campaigns WHERE id = ? AND workspace_id = ?").bind(campaignId, workspaceId).first();
  if (!existing) throw notFound("Campaign not found");
  await env.DB.prepare(
    "UPDATE campaigns SET name = ?, description = ?, objective = ?, start_date = ?, end_date = ? WHERE id = ?",
  ).bind(input.name.trim(), input.description ?? null, input.objective ?? null, input.startDate ?? null, input.endDate ?? null, campaignId).run();
  return (await getCampaign(env, workspaceId, campaignId))!;
}

export async function deleteCampaign(env: Env, workspaceId: string, campaignId: string, actorId: string): Promise<void> {
  const existing = await env.DB.prepare("SELECT id FROM campaigns WHERE id = ? AND workspace_id = ?").bind(campaignId, workspaceId).first();
  if (!existing) throw notFound("Campaign not found");
  await env.DB.prepare("DELETE FROM campaigns WHERE id = ?").bind(campaignId).run();
  await audit(env, workspaceId, actorId, "campaign.delete", "campaigns", campaignId, {});
}