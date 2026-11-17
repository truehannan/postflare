import { createMiddleware } from "hono/factory";
import type { Env, AuthedUser, WorkspaceScope } from "../env";
import { badRequest, forbidden } from "../utils/http";

export type WorkspaceVariables = { user: AuthedUser; workspace: WorkspaceScope };

/**
 * Resolve the active workspace from the `X-Workspace-Id` header and verify the
 * authenticated user is a member. The frontend always sends this header after
 * a workspace is selected; the header value is NEVER trusted without a
 * membership check.
 */
export const requireWorkspace = createMiddleware<{ Bindings: Env; Variables: WorkspaceVariables }>(
  async (c, next) => {
    const workspaceId = c.req.header("x-workspace-id");
    if (!workspaceId) throw badRequest("Missing workspace (X-Workspace-Id header)");

    const member = await c.env.DB.prepare(
      "SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?",
    )
      .bind(workspaceId, c.get("user").userId)
      .first<{ role: string }>();

    if (!member) throw forbidden("You are not a member of this workspace");
    c.set("workspace", { workspaceId, role: member.role });
    await next();
  },
);

export const ROLES = ["owner", "admin", "manager", "editor", "publisher", "analyst", "inbox_agent"] as const;
export type Role = (typeof ROLES)[number];

const ROLE_ORDER: Record<Role, number> = {
  owner: 100,
  admin: 90,
  manager: 70,
  editor: 50,
  publisher: 40,
  analyst: 30,
  inbox_agent: 20,
};

export function roleAtLeast(role: string, minimum: Role): boolean {
  return (ROLE_ORDER[role as Role] ?? 0) >= ROLE_ORDER[minimum];
}