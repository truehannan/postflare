import type { Env } from "../env";
import { randomId } from "../utils/id";

export async function notify(
  env: Env,
  input: { workspaceId: string; userId?: string | null; type: string; title: string; body?: string },
): Promise<void> {
  try {
    await env.DB.prepare(
      "INSERT INTO notifications (id, workspace_id, user_id, type, title, body, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)",
    )
      .bind(randomId("ntf"), input.workspaceId, input.userId ?? null, input.type, input.title, input.body ?? null, new Date().toISOString())
      .run();
  } catch {
    // Notification failure must not break the operation.
  }
}