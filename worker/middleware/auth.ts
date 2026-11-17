import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import type { Env, AuthedUser } from "../env";
import { resolveSession, SESSION_COOKIE } from "../services/auth";
import { unauthorized } from "../utils/http";

export type AuthedVariables = { user: AuthedUser };

/** Require a valid session cookie. Populates `c.var.user`. */
export const requireAuth = createMiddleware<{ Bindings: Env; Variables: AuthedVariables }>(
  async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE);
    const session = await resolveSession(c.env, token);
    if (!session) throw unauthorized();
    c.set("user", session);
    await next();
  },
);

/** Optional auth — populates `c.var.user` when a valid session exists. */
export const optionalAuth = createMiddleware<{ Bindings: Env; Variables: AuthedVariables }>(
  async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE);
    const session = await resolveSession(c.env, token);
    if (session) c.set("user", session);
    await next();
  },
);