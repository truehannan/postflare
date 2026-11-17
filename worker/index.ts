import { Hono } from "hono";
import type { Env, AuthedUser, WorkspaceScope } from "./env";
import { registerRoutes } from "./routes";
import { ApiError, jsonError } from "./utils/http";
import { publishJob, type QueueMessage } from "./services/publishing";
import { sweep } from "./services/scheduling";

const app = new Hono<{ Bindings: Env; Variables: { user: AuthedUser; workspace: WorkspaceScope } }>();

// Public media serving (R2-backed; keys are unguessable asset ids).
app.get("/media/*", async (c) => {
  const key = c.req.path.replace(/^\/media\//, "");
  if (!key || key.includes("..")) return new Response("Not found", { status: 404 });
  const object = await c.env.MEDIA.get(key);
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  return new Response(object.body, { headers });
});

registerRoutes(app);

app.onError((err, c) => {
  if (err instanceof ApiError) return jsonError(c, err);
  // Never leak internal error details or secrets.
  console.error("unhandled_error", err instanceof Error ? err.message : String(err));
  return c.json({ error: { code: "internal_error", message: "An unexpected error occurred" } }, 500);
});

app.notFound((c) => c.json({ error: { code: "not_found", message: "Not found" } }, 404));

const API_PREFIXES = ["/api/", "/oauth/", "/media/", "/ws/"];

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/ws/inbox") {
      const id = env.INBOX_HUB.idFromName(url.searchParams.get("workspace") ?? "default");
      return env.INBOX_HUB.get(id).fetch(request);
    }
    if (API_PREFIXES.some((p) => url.pathname.startsWith(p))) {
      return app.fetch(request, env, ctx);
    }
    // Static assets with SPA fallback (index.html for client routes).
    return env.ASSETS.fetch(request);
  },

  /** Cron — enqueue due posts and resume delayed automations. */
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(sweep(env));
  },

  /** Queue consumer — publishing jobs with the queue's built-in retries. */
  async queue(batch: MessageBatch<QueueMessage>, env: Env, ctx: ExecutionContext): Promise<void> {
    for (const message of batch.messages) {
      if (message.body?.type === "publish") {
        ctx.waitUntil(publishJob(env, message.body.jobId));
      } else {
        message.ack();
      }
    }
  },
};

export { InboxHub } from "./durable-objects/inbox-hub";