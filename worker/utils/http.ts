import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { z } from "zod";

/** Application-level error with a stable machine-readable code. */
export class ApiError extends Error {
  constructor(
    public readonly status: ContentfulStatusCode,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function err(status: ContentfulStatusCode, code: string, message: string, details?: Record<string, unknown>): ApiError {
  return new ApiError(status, code, message, details);
}

export function unauthorized(message = "Authentication required"): ApiError {
  return err(401, "unauthorized", message);
}

export function forbidden(message = "You do not have access to this resource"): ApiError {
  return err(403, "forbidden", message);
}

export function notFound(message = "Resource not found"): ApiError {
  return err(404, "not_found", message);
}

export function conflict(message: string): ApiError {
  return err(409, "conflict", message);
}

export function badRequest(message: string, details?: Record<string, unknown>): ApiError {
  return err(400, "bad_request", message, details);
}

export function jsonOk(c: Context, data: unknown, status: ContentfulStatusCode = 200): Response {
  return c.json({ data }, status);
}

export function jsonError(c: Context, error: ApiError): Response {
  // Never leak internal details; only expose the sanitised shape.
  return c.json(
    {
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    },
    error.status,
  );
}

/** Parse and validate a JSON body against a Zod schema. */
export async function parseJson<T>(
  c: Context,
  schema: z.ZodType<T>,
): Promise<T> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw badRequest("Request body must be valid JSON");
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const details: Record<string, unknown> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join(".") || "_";
      details[key] = issue.message;
    }
    throw badRequest("Validation failed", details);
  }
  return result.data;
}

export function getCursor(c: Context, defaultLimit = 50): { limit: number; cursor: string | null } {
  const limit = Math.min(Math.max(Number(c.req.query("limit")) || defaultLimit, 1), 100);
  const cursor = c.req.query("cursor") ?? null;
  return { limit, cursor };
}