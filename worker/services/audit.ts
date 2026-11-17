import type { Env } from "../env";
import { randomId } from "../utils/id";

export async function audit(
  env: Env,
  workspaceId: string,
  actorId: string | null,
  action: string,
  resourceType: string,
  resourceId?: string | null,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    await env.DB.prepare(
      "INSERT INTO audit_logs (id, workspace_id, actor_id, action, resource_type, resource_id, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(
        randomId("audit"),
        workspaceId,
        actorId,
        action,
        resourceType,
        resourceId ?? null,
        JSON.stringify(metadata),
        new Date().toISOString(),
      )
      .run();
  } catch {
    // Audit logging must never break the primary operation.
  }
}