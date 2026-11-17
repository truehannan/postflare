/**
 * Postflare — Worker environment bindings.
 *
 * These are declared in wrangler.jsonc. `ENCRYPTION_KEY` is the ONLY manually
 * configured application encryption secret; every platform credential is
 * managed through the dashboard and encrypted with it.
 */
export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  PUBLISH_QUEUE: Queue;
  INBOX_HUB: DurableObjectNamespace;
  ASSETS: Fetcher;
  ENCRYPTION_KEY: string;
  /** Public base URL used to resolve media URLs for external providers. */
  PUBLIC_BASE_URL: string;
}

/** Injected onto the Hono context by middleware. */
export interface AuthedUser {
  userId: string;
  sessionId: string;
}

export interface WorkspaceScope {
  workspaceId: string;
  role: string;
}