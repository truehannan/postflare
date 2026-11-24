import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import type { Env, AuthedUser, WorkspaceScope } from "../env";
import { requireAuth } from "../middleware/auth";
import { requireWorkspace, roleAtLeast } from "../middleware/workspace";
import { rateLimit } from "../middleware/rate-limit";
import { jsonOk, parseJson, badRequest, forbidden } from "../utils/http";
import { registerUser, loginUser, destroySession } from "../services/auth";
import * as workspaces from "../services/workspaces";
import * as credentials from "../services/credentials";
import * as accounts from "../services/accounts";
import * as oauth from "../services/oauth";
import * as posts from "../services/posts";
import * as media from "../services/media";
import * as inbox from "../services/inbox";
import * as contacts from "../services/contacts";
import * as automations from "../services/automation";
import * as analytics from "../services/analytics";
import * as campaigns from "../services/campaigns";
import * as approvals from "../services/approvals";
import * as team from "../services/team";
import * as accounts_ from "../services/accounts";
import { getPlatform, PLATFORMS } from "../../shared/capabilities";
import { AUTOMATION_NODE_TYPES, compileSimpleFlow, type SimpleAutomation } from "../../shared/automation";
import { COMPOSIO_SUPPORTED } from "../../shared/composio";
import * as composio from "../services/composio";
import { hasAdapter } from "../adapters/registry";

type AppCtx = { Bindings: Env; Variables: { user: AuthedUser; workspace: WorkspaceScope } };

const isHttps = (url: string) => new URL(url).protocol === "https:";

export function registerRoutes(app: Hono<{ Bindings: Env; Variables: { user: AuthedUser; workspace: WorkspaceScope } }>): void {
  // -------------------------------------------------------------------------
  // Auth (public)
  // -------------------------------------------------------------------------
  const auth = new Hono<AppCtx>();
  auth.post("/register", rateLimit("auth"), async (c) => {
    const input = await parseJson(c, z.object({
      email: z.string().email(),
      name: z.string().min(1),
      password: z.string().min(8),
    }));
    const result = await registerUser(c.env, input);
    setCookie(c, "pf_session", result.token, { httpOnly: true, secure: isHttps(c.req.url), sameSite: "Lax", path: "/", maxAge: 30 * 24 * 3600 });
    return jsonOk(c, { userId: result.userId, workspaceId: result.workspaceId }, 201);
  });
  auth.post("/login", rateLimit("auth"), async (c) => {
    const input = await parseJson(c, z.object({ email: z.string().email(), password: z.string().min(1) }));
    const token = await loginUser(c.env, input.email, input.password);
    setCookie(c, "pf_session", token, { httpOnly: true, secure: isHttps(c.req.url), sameSite: "Lax", path: "/", maxAge: 30 * 24 * 3600 });
    return jsonOk(c, { ok: true });
  });
  auth.post("/logout", async (c) => {
    await destroySession(c.env, getCookie(c, "pf_session"));
    setCookie(c, "pf_session", "", { httpOnly: true, secure: isHttps(c.req.url), sameSite: "Lax", path: "/", maxAge: 0 });
    return jsonOk(c, { ok: true });
  });

  const me = new Hono<AppCtx>();
  me.use("*", requireAuth);
  me.get("/", async (c) => {
    const userId = c.get("user").userId;
    const userRow = await c.env.DB.prepare("SELECT id, email, name, avatar_url, created_at FROM users WHERE id = ?").bind(userId).first<Record<string, unknown>>();
    const ws = await workspaces.listWorkspaces(c.env, userId);
    return jsonOk(c, {
      user: { id: userRow?.id, email: userRow?.email, name: userRow?.name, avatarUrl: userRow?.avatar_url ?? null, createdAt: userRow?.created_at },
      workspaces: ws,
    });
  });

  app.route("/api/auth", auth);
  app.route("/api/auth/me", me);

  // -------------------------------------------------------------------------
  // Workspaces
  // -------------------------------------------------------------------------
  const workspaceRoutes = new Hono<AppCtx>();
  workspaceRoutes.use("*", requireAuth);
  workspaceRoutes.get("/", async (c) => jsonOk(c, await workspaces.listWorkspaces(c.env, c.get("user").userId)));
  workspaceRoutes.post("/", async (c) => {
    const input = await parseJson(c, z.object({ name: z.string().min(1) }));
    const ws = await workspaces.createWorkspace(c.env, c.get("user").userId, input.name);
    return jsonOk(c, ws, 201);
  });
  app.route("/api/workspaces", workspaceRoutes);

  // -------------------------------------------------------------------------
  // Integrations (platform registry)
  // -------------------------------------------------------------------------
  const integrationRoutes = new Hono<AppCtx>();
  integrationRoutes.use("*", requireAuth, requireWorkspace);
  integrationRoutes.get("/", async (c) => {
    const workspaceId = c.get("workspace").workspaceId;
    const creds = await credentials.listCredentialRecords(c.env, workspaceId);
    const configured = new Set(creds.map((r) => r.providerId));
    const counts = await c.env.DB.prepare(
      "SELECT provider_id, connection_mode, COUNT(*) AS n FROM connected_accounts WHERE workspace_id = ? GROUP BY provider_id, connection_mode",
    ).bind(workspaceId).all<{ provider_id: string; connection_mode: string; n: number }>();
    const byProvider = new Map<string, { direct: number; composio: number }>();
    for (const row of counts.results ?? []) {
      const entry = byProvider.get(row.provider_id) ?? { direct: 0, composio: 0 };
      if (row.connection_mode === "composio") entry.composio = row.n;
      else entry.direct = row.n;
      byProvider.set(row.provider_id, entry);
    }
    const list = PLATFORMS.map((p) => ({
      ...p,
      configured: configured.has(p.id),
      adapterImplemented: hasAdapter(p.id),
      accountCounts: byProvider.get(p.id) ?? { direct: 0, composio: 0 },
    }));
    return jsonOk(c, list);
  });
  integrationRoutes.get("/:providerId", async (c) => {
    const platform = getPlatform(c.req.param("providerId"));
    if (!platform) throw badRequest("Unknown provider");
    const workspaceId = c.get("workspace").workspaceId;
    const creds = await credentials.getCredentialRecord(c.env, workspaceId, platform.id);
    const accounts = await accounts_.listAccounts(c.env, workspaceId);
    return jsonOk(c, {
      ...platform,
      configured: !!creds,
      masked: creds?.masked ?? {},
      fieldKeys: creds?.fieldKeys ?? [],
      adapterImplemented: hasAdapter(platform.id),
      accounts: accounts.filter((a) => a.providerId === platform.id),
    });
  });
  app.route("/api/integrations", integrationRoutes);

  // -------------------------------------------------------------------------
  // Composio hub (single API key for every supported platform)
  // -------------------------------------------------------------------------
  const composioRoutes = new Hono<AppCtx>();
  composioRoutes.use("*", requireAuth, requireWorkspace);
  composioRoutes.get("/", async (c) => {
    const record = await credentials.getCredentialRecord(c.env, c.get("workspace").workspaceId, "composio");
    return jsonOk(c, {
      configured: !!record,
      supported: COMPOSIO_SUPPORTED,
    });
  });
  composioRoutes.put("/key", async (c) => {
    const input = await parseJson(c, z.object({ apiKey: z.string().min(1) }));
    await credentials.storeCredentials(c.env, c.get("workspace").workspaceId, "composio", { apiKey: input.apiKey }, c.get("user").userId);
    const test = await credentials.testCredentials(c.env, c.get("workspace").workspaceId, "composio");
    return jsonOk(c, test);
  });
  composioRoutes.post("/test", async (c) => {
    const input = await parseJson(c, z.object({ apiKey: z.string().optional() }).optional());
    const result = await credentials.testCredentials(c.env, c.get("workspace").workspaceId, "composio", input?.apiKey ? { apiKey: input.apiKey } : undefined);
    return jsonOk(c, result);
  });
  composioRoutes.get("/connected-accounts", async (c) => {
    const list = await composio.listComposioAccounts(c.env, c.get("workspace").workspaceId);
    return jsonOk(c, list);
  });
  composioRoutes.get("/connection-status", async (c) => {
    const id = c.req.query("id");
    if (!id) throw badRequest("Missing id query parameter");
    const status = await composio.getComposioConnectionStatus(c.env, c.get("workspace").workspaceId, id);
    return jsonOk(c, status);
  });
  composioRoutes.post("/connect", async (c) => {
    const input = await parseJson(c, z.object({ providerId: z.string().min(1) }));
    const origin = new URL(c.req.url).origin;
    const result = await composio.initiateComposioConnection(c.env, c.get("workspace").workspaceId, input.providerId, origin);
    return jsonOk(c, result);
  });
  composioRoutes.post("/import", async (c) => {
    const input = await parseJson(c, z.object({
      composioAccountId: z.string().min(1),
      providerId: z.string().min(1),
      accountName: z.string().optional(),
      config: z.record(z.string(), z.string()).optional(),
    }));
    const result = await composio.importComposioAccount(c.env, c.get("workspace").workspaceId, c.get("user").userId, input);
    return jsonOk(c, result, 201);
  });
  app.route("/api/composio", composioRoutes);

  // -------------------------------------------------------------------------
  // Credentials
  // -------------------------------------------------------------------------
  const credentialRoutes = new Hono<AppCtx>();
  credentialRoutes.use("*", requireAuth, requireWorkspace);
  credentialRoutes.get("/", async (c) => jsonOk(c, await credentials.listCredentialRecords(c.env, c.get("workspace").workspaceId)));
  credentialRoutes.get("/:providerId", async (c) => {
    const rec = await credentials.getCredentialRecord(c.env, c.get("workspace").workspaceId, c.req.param("providerId"));
    return jsonOk(c, rec ?? null);
  });
  credentialRoutes.put("/:providerId", async (c) => {
    const input = await parseJson(c, z.object({ fields: z.record(z.string(), z.string()) }));
    await credentials.storeCredentials(c.env, c.get("workspace").workspaceId, c.req.param("providerId"), input.fields, c.get("user").userId);
    return jsonOk(c, { ok: true });
  });
  credentialRoutes.delete("/:providerId", async (c) => {
    await credentials.deleteCredentials(c.env, c.get("workspace").workspaceId, c.req.param("providerId"), c.get("user").userId);
    return jsonOk(c, { ok: true });
  });
  credentialRoutes.post("/:providerId/test", async (c) => {
    const input = await parseJson(c, z.object({ fields: z.record(z.string(), z.string()).optional() }).optional());
    const result = await credentials.testCredentials(c.env, c.get("workspace").workspaceId, c.req.param("providerId"), input?.fields);
    return jsonOk(c, result);
  });
  app.route("/api/credentials", credentialRoutes);

  // -------------------------------------------------------------------------
  // OAuth
  // -------------------------------------------------------------------------
  const oauthRoutes = new Hono<AppCtx>();
  oauthRoutes.use("*", requireAuth, requireWorkspace);
  oauthRoutes.post("/:providerId/authorize", async (c) => {
    const input = await parseJson(c, z.object({ redirectUri: z.string().url() }));
    const result = await oauth.beginOAuth(c.env, c.get("workspace").workspaceId, c.req.param("providerId"), input.redirectUri);
    return jsonOk(c, result);
  });
  app.route("/api/oauth", oauthRoutes);

  // OAuth callback (public — providers redirect here)
  app.get("/oauth/callback", async (c) => {
    const providerId = c.req.query("provider") ?? "";
    const code = c.req.query("code") ?? "";
    const state = c.req.query("state") ?? "";
    const origin = new URL(c.req.url).origin;
    const redirectUri = `${origin}/oauth/callback`;
    const success = `/settings/integrations?oauth=success`;
    const failure = `/settings/integrations?oauth=error`;
    try {
      await oauth.completeOAuth(c.env, providerId, code, state, redirectUri);
      return c.redirect(success);
    } catch {
      return c.redirect(failure);
    }
  });

  // -------------------------------------------------------------------------
  // Accounts
  // -------------------------------------------------------------------------
  const accountRoutes = new Hono<AppCtx>();
  accountRoutes.use("*", requireAuth, requireWorkspace);
  accountRoutes.get("/", async (c) => jsonOk(c, await accounts.listAccounts(c.env, c.get("workspace").workspaceId)));
  accountRoutes.get("/:id", async (c) => jsonOk(c, await accounts.getAccount(c.env, c.get("workspace").workspaceId, c.req.param("id"))));
  accountRoutes.post("/connect", async (c) => {
    const input = await parseJson(c, z.object({
      providerId: z.string(),
      fields: z.record(z.string(), z.string()).optional(),
      accountName: z.string().optional(),
    }));
    const platform = getPlatform(input.providerId);
    if (!platform) throw badRequest("Unknown provider");
    // Manual-credential connection: store + validate + create account.
    const creds = input.fields ?? {};
    await credentials.storeCredentials(c.env, c.get("workspace").workspaceId, input.providerId, creds, c.get("user").userId);
    const test = await credentials.testCredentials(c.env, c.get("workspace").workspaceId, input.providerId, creds);
    if (!test.ok) throw badRequest(test.message);

    const { getAdapter } = await import("../adapters/registry");
    const adapter = getAdapter(input.providerId);
    let profile = { accountName: input.accountName ?? platform.name, username: "", avatarUrl: null as string | null, externalId: "" };
    if (adapter.getAccountProfile) {
      const p = await adapter.getAccountProfile(creds);
      profile = { accountName: p.accountName, username: p.username, avatarUrl: p.avatarUrl ?? null, externalId: p.externalId };
    }
    const credRow = await c.env.DB.prepare("SELECT id FROM integration_credentials WHERE workspace_id = ? AND provider_id = ?")
      .bind(c.get("workspace").workspaceId, input.providerId).first<{ id: string }>();
    const accountId = await accounts.createAccount(c.env, {
      workspaceId: c.get("workspace").workspaceId,
      providerId: input.providerId,
      credentialsId: credRow?.id ?? null,
      externalId: profile.externalId,
      accountName: profile.accountName,
      username: profile.username,
      avatarUrl: profile.avatarUrl,
      tokenExpiresAt: null,
    });
    return jsonOk(c, { accountId }, 201);
  });
  accountRoutes.post("/:id/test", async (c) => jsonOk(c, await accounts.testAccount(c.env, c.get("workspace").workspaceId, c.req.param("id"))));
  accountRoutes.post("/:id/default", async (c) => {
    await accounts.setDefaultAccount(c.env, c.get("workspace").workspaceId, c.req.param("id"));
    return jsonOk(c, { ok: true });
  });
  accountRoutes.delete("/:id", async (c) => {
    await accounts.deleteAccount(c.env, c.get("workspace").workspaceId, c.req.param("id"), c.get("user").userId);
    return jsonOk(c, { ok: true });
  });
  app.route("/api/accounts", accountRoutes);

  // -------------------------------------------------------------------------
  // Posts
  // -------------------------------------------------------------------------
  const postRoutes = new Hono<AppCtx>();
  postRoutes.use("*", requireAuth, requireWorkspace);
  postRoutes.get("/", async (c) => {
    const limit = Math.min(Number(c.req.query("limit")) || 50, 100);
    const result = await posts.listPosts(c.env, c.get("workspace").workspaceId, {
      status: c.req.query("status") ?? undefined,
      campaignId: c.req.query("campaignId") ?? undefined,
      limit,
      cursor: c.req.query("cursor") ?? null,
    });
    return jsonOk(c, result);
  });
  postRoutes.get("/:id", async (c) => jsonOk(c, await posts.getPost(c.env, c.get("workspace").workspaceId, c.req.param("id"))));
  postRoutes.post("/", async (c) => {
    const input = await parseJson(c, z.object({
      variants: z.array(z.object({
        providerId: z.string(),
        text: z.string().default(""),
        title: z.string().nullish(),
        link: z.string().nullish(),
        mediaIds: z.array(z.string()).default([]),
        firstComment: z.string().nullish(),
        location: z.string().nullish(),
        altText: z.string().nullish(),
      })).min(1),
      accountIds: z.array(z.string()).default([]),
      scheduledFor: z.string().nullish(),
      publishNow: z.boolean().default(false),
      campaignId: z.string().nullish(),
      attachTemplateIds: z.array(z.string()).default([]),
      attachTemplates: z.array(z.object({
        templateId: z.string().min(1),
        simple: z.any().optional(),
      })).default([]),
      attachAutomationIds: z.array(z.string()).default([]),
    }));
    const post = await posts.createPost(c.env, c.get("workspace").workspaceId, c.get("user").userId, input);
    return jsonOk(c, post, 201);
  });
  postRoutes.patch("/:id/status", async (c) => {
    const input = await parseJson(c, z.object({ status: z.enum(["draft", "scheduled", "approved", "cancelled", "awaiting_approval"]) }));
    const post = await posts.updatePostStatus(c.env, c.get("workspace").workspaceId, c.req.param("id"), input.status, c.get("user").userId);
    return jsonOk(c, post);
  });
  postRoutes.post("/:id/enqueue", async (c) => {
    const result = await (await import("../services/publishing")).enqueuePost(c.env, c.get("workspace").workspaceId, c.req.param("id"), c.get("user").userId);
    return jsonOk(c, result);
  });
  postRoutes.post("/:id/cancel", async (c) => {
    await (await import("../services/publishing")).cancelPost(c.env, c.get("workspace").workspaceId, c.req.param("id"), c.get("user").userId);
    return jsonOk(c, { ok: true });
  });
  postRoutes.delete("/:id", async (c) => {
    await posts.deletePost(c.env, c.get("workspace").workspaceId, c.req.param("id"), c.get("user").userId);
    return jsonOk(c, { ok: true });
  });
  app.route("/api/posts", postRoutes);

  // Calendar
  const calendarRoutes = new Hono<AppCtx>();
  calendarRoutes.use("*", requireAuth, requireWorkspace);
  calendarRoutes.get("/", async (c) => {
    const start = c.req.query("start") ?? new Date(Date.now() - 30 * 86400_000).toISOString();
    const end = c.req.query("end") ?? new Date(Date.now() + 60 * 86400_000).toISOString();
    const rows = await c.env.DB.prepare(
      "SELECT id, status, scheduled_for, created_at FROM posts WHERE workspace_id = ? AND deleted_at IS NULL AND scheduled_for IS NOT NULL AND scheduled_for BETWEEN ? AND ? ORDER BY scheduled_for ASC",
    ).bind(c.get("workspace").workspaceId, start, end).all<Record<string, unknown>>();
    return jsonOk(c, rows.results ?? []);
  });
  app.route("/api/calendar", calendarRoutes);

  // -------------------------------------------------------------------------
  // Media
  // -------------------------------------------------------------------------
  const mediaRoutes = new Hono<AppCtx>();
  mediaRoutes.use("*", requireAuth, requireWorkspace);
  mediaRoutes.get("/", async (c) => {
    const result = await media.listMedia(c.env, c.get("workspace").workspaceId, {
      limit: Math.min(Number(c.req.query("limit")) || 50, 100),
      cursor: c.req.query("cursor") ?? null,
      search: c.req.query("search") ?? undefined,
    });
    return jsonOk(c, result);
  });
  mediaRoutes.post("/", async (c) => {
    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw badRequest("A 'file' field is required");
    const asset = await media.uploadMedia(c.env, c.get("workspace").workspaceId, {
      filename: file.name || "upload",
      mimeType: file.type || "application/octet-stream",
      data: await file.arrayBuffer(),
    });
    return jsonOk(c, asset, 201);
  });
  mediaRoutes.get("/:id", async (c) => jsonOk(c, await media.getMedia(c.env, c.get("workspace").workspaceId, c.req.param("id"))));
  mediaRoutes.delete("/:id", async (c) => {
    await media.deleteMedia(c.env, c.get("workspace").workspaceId, c.req.param("id"));
    return jsonOk(c, { ok: true });
  });
  app.route("/api/media", mediaRoutes);

  // -------------------------------------------------------------------------
  // Inbox
  // -------------------------------------------------------------------------
  const inboxRoutes = new Hono<AppCtx>();
  inboxRoutes.use("*", requireAuth, requireWorkspace);
  inboxRoutes.get("/conversations", async (c) => {
    const result = await inbox.listConversations(c.env, c.get("workspace").workspaceId, {
      limit: Math.min(Number(c.req.query("limit")) || 50, 100),
      cursor: c.req.query("cursor") ?? null,
      status: c.req.query("status") ?? undefined,
      assignee: (c.req.query("assignee") as "me" | "unassigned") ?? undefined,
      search: c.req.query("search") ?? undefined,
    });
    return jsonOk(c, result);
  });
  inboxRoutes.get("/conversations/:id", async (c) => jsonOk(c, await inbox.getConversation(c.env, c.get("workspace").workspaceId, c.req.param("id"))));
  inboxRoutes.get("/conversations/:id/messages", async (c) => jsonOk(c, await inbox.listMessages(c.env, c.get("workspace").workspaceId, c.req.param("id"))));
  inboxRoutes.post("/conversations/:id/reply", async (c) => {
    const input = await parseJson(c, z.object({ text: z.string().min(1) }));
    const result = await inbox.sendReply(c.env, c.get("workspace").workspaceId, c.req.param("id"), input.text);
    return jsonOk(c, result);
  });
  inboxRoutes.post("/conversations/:id/read", async (c) => {
    const input = await parseJson(c, z.object({ read: z.boolean().default(true) }).optional());
    await inbox.markRead(c.env, c.get("workspace").workspaceId, c.req.param("id"), input?.read ?? true);
    return jsonOk(c, { ok: true });
  });
  inboxRoutes.post("/conversations/:id/assign", async (c) => {
    const input = await parseJson(c, z.object({ userId: z.string().nullable() }));
    await inbox.assignConversation(c.env, c.get("workspace").workspaceId, c.req.param("id"), input.userId, c.get("user").userId);
    return jsonOk(c, { ok: true });
  });
  inboxRoutes.post("/conversations/:id/notes", async (c) => {
    const input = await parseJson(c, z.object({ body: z.string().min(1) }));
    await inbox.addNote(c.env, c.get("workspace").workspaceId, c.req.param("id"), input.body, c.get("user").userId);
    return jsonOk(c, { ok: true });
  });
  inboxRoutes.patch("/conversations/:id/status", async (c) => {
    const input = await parseJson(c, z.object({ status: z.enum(["open", "pending", "closed", "archived"]) }));
    await inbox.updateConversationStatus(c.env, c.get("workspace").workspaceId, c.req.param("id"), input.status);
    return jsonOk(c, { ok: true });
  });
  inboxRoutes.get("/quick-replies", async (c) => jsonOk(c, await inbox.listQuickReplies(c.env, c.get("workspace").workspaceId)));
  inboxRoutes.post("/quick-replies", async (c) => {
    const input = await parseJson(c, z.object({ title: z.string().min(1), body: z.string().min(1) }));
    await inbox.createQuickReply(c.env, c.get("workspace").workspaceId, input.title, input.body);
    return jsonOk(c, { ok: true }, 201);
  });
  app.route("/api/inbox", inboxRoutes);

  // -------------------------------------------------------------------------
  // Contacts
  // -------------------------------------------------------------------------
  const contactRoutes = new Hono<AppCtx>();
  contactRoutes.use("*", requireAuth, requireWorkspace);
  contactRoutes.get("/", async (c) => {
    const result = await contacts.listContacts(c.env, c.get("workspace").workspaceId, {
      limit: Math.min(Number(c.req.query("limit")) || 50, 100),
      cursor: c.req.query("cursor") ?? null,
      search: c.req.query("search") ?? undefined,
      tag: c.req.query("tag") ?? undefined,
    });
    return jsonOk(c, result);
  });
  contactRoutes.get("/export", async (c) => {
    const csv = await contacts.exportContactsCsv(c.env, c.get("workspace").workspaceId);
    return c.newResponse(csv, 200, { "content-type": "text/csv", "content-disposition": "attachment; filename=contacts.csv" });
  });
  contactRoutes.post("/import", async (c) => {
    const body = await c.req.text();
    const parsed = contacts.importContactsCsv(body);
    const created: string[] = [];
    for (const input of parsed) {
      const contact = await contacts.createContact(c.env, c.get("workspace").workspaceId, input);
      created.push(contact.id);
    }
    return jsonOk(c, { imported: created.length });
  });
  contactRoutes.get("/:id", async (c) => jsonOk(c, await contacts.getContact(c.env, c.get("workspace").workspaceId, c.req.param("id"))));
  contactRoutes.post("/", async (c) => {
    const input = await parseJson(c, z.object({
      name: z.string().nullish(), username: z.string().nullish(), email: z.string().nullish(),
      phone: z.string().nullish(), consent: z.enum(["unknown", "granted", "revoked"]).default("unknown"),
    }));
    return jsonOk(c, await contacts.createContact(c.env, c.get("workspace").workspaceId, input), 201);
  });
  contactRoutes.patch("/:id", async (c) => {
    const input = await parseJson(c, z.object({
      name: z.string().nullish(), username: z.string().nullish(), email: z.string().nullish(),
      phone: z.string().nullish(), consent: z.enum(["unknown", "granted", "revoked"]).optional(), assignedTo: z.string().nullish(),
    }));
    return jsonOk(c, await contacts.updateContact(c.env, c.get("workspace").workspaceId, c.req.param("id"), input));
  });
  contactRoutes.delete("/:id", async (c) => {
    await contacts.deleteContact(c.env, c.get("workspace").workspaceId, c.req.param("id"), c.get("user").userId);
    return jsonOk(c, { ok: true });
  });
  contactRoutes.post("/:id/tags", async (c) => {
    const input = await parseJson(c, z.object({ tag: z.string().min(1) }));
    await contacts.addTag(c.env, c.get("workspace").workspaceId, c.req.param("id"), input.tag);
    return jsonOk(c, { ok: true });
  });
  contactRoutes.delete("/:id/tags/:tag", async (c) => {
    await contacts.removeTag(c.env, c.get("workspace").workspaceId, c.req.param("id"), c.req.param("tag"));
    return jsonOk(c, { ok: true });
  });
  app.route("/api/contacts", contactRoutes);

  // -------------------------------------------------------------------------
  // Automations
  // -------------------------------------------------------------------------
  const automationRoutes = new Hono<AppCtx>();
  automationRoutes.use("*", requireAuth, requireWorkspace);
  automationRoutes.get("/", async (c) => jsonOk(c, await automations.listAutomations(c.env, c.get("workspace").workspaceId)));
  automationRoutes.get("/node-types", async (c) => jsonOk(c, AUTOMATION_NODE_TYPES));

  // ---------------------------------------------------------------------
  // Automation templates (the library managed on the Automations page;
  // instances are created per post from the composer).
  // ---------------------------------------------------------------------
  automationRoutes.get("/templates", async (c) =>
    jsonOk(c, await automations.listTemplates(c.env, c.get("workspace").workspaceId)));
  automationRoutes.get("/templates/:id", async (c) => {
    const template = await automations.getTemplate(c.env, c.get("workspace").workspaceId, c.req.param("id"));
    if (!template) throw badRequest("Template not found");
    return jsonOk(c, template);
  });
  automationRoutes.post("/templates", async (c) => {
    const input = await parseJson(c, z.object({
      name: z.string().min(1),
      triggerType: z.string(),
      simple: z.any().optional(),
    }));
    const result = await automations.createTemplate(c.env, c.get("workspace").workspaceId, c.get("user").userId, input);
    return jsonOk(c, result, 201);
  });
  automationRoutes.put("/templates/:id", async (c) => {
    const input = await parseJson(c, z.object({
      name: z.string().min(1),
      simple: z.any(),
    }));
    await automations.updateTemplate(c.env, c.get("workspace").workspaceId, c.req.param("id"), c.get("user").userId, input);
    return jsonOk(c, { ok: true });
  });
  automationRoutes.delete("/templates/:id", async (c) => {
    await automations.deleteTemplate(c.env, c.get("workspace").workspaceId, c.req.param("id"), c.get("user").userId);
    return jsonOk(c, { ok: true });
  });
  automationRoutes.get("/:id", async (c) => jsonOk(c, await automations.getAutomation(c.env, c.get("workspace").workspaceId, c.req.param("id"))));
  automationRoutes.get("/:id/latest", async (c) => {
    const row = await c.env.DB.prepare(
      "SELECT version, definition_json FROM automation_versions WHERE automation_id = ? ORDER BY version DESC LIMIT 1",
    ).bind(c.req.param("id")).first<{ version: number; definition_json: string }>();
    return jsonOk(c, row ? { version: row.version, definition: JSON.parse(row.definition_json) } : { version: 0, definition: null });
  });
  automationRoutes.post("/", async (c) => {
    const input = await parseJson(c, z.object({
      name: z.string().min(1),
      triggerType: z.string(),
      triggerConfig: z.record(z.string(), z.unknown()).optional(),
      definition: z.any().optional(),
      simple: z.any().optional(),
    }));
    const input2 = input as automations.CreateAutomationInput & { simple?: SimpleAutomation };
    const definition = input2.simple
      ? { ...compileSimpleFlow(input2.simple), simple: input2.simple }
      : input.definition;
    return jsonOk(c, await automations.createAutomation(c.env, c.get("workspace").workspaceId, c.get("user").userId, { ...input2, definition }), 201);
  });
  automationRoutes.post("/:id/publish", async (c) => {
    const input = await parseJson(c, z.object({ definition: z.any().optional(), simple: z.any().optional() }));
    const definition = input.simple
      ? { ...compileSimpleFlow(input.simple as SimpleAutomation), simple: input.simple }
      : input.definition;
    return jsonOk(c, await automations.publishAutomation(c.env, c.get("workspace").workspaceId, c.req.param("id"), definition, c.get("user").userId));
  });
  automationRoutes.post("/:id/test", async (c) => {
    const input = await parseJson(c, z.object({ message: z.string().optional(), contactId: z.string().nullish(), variables: z.record(z.string(), z.string()).optional() }));
    const result = await automations.executeAutomation(c.env, c.get("workspace").workspaceId, c.req.param("id"), { message: input.message, contactId: input.contactId ?? undefined, variables: input.variables }, true);
    return jsonOk(c, result);
  });
  automationRoutes.get("/:id/executions", async (c) => {
    const rows = await c.env.DB.prepare(
      "SELECT id, automation_id, version, status, error, started_at, finished_at FROM automation_executions WHERE workspace_id = ? AND automation_id = ? ORDER BY started_at DESC LIMIT 100",
    ).bind(c.get("workspace").workspaceId, c.req.param("id")).all<Record<string, unknown>>();
    return jsonOk(c, rows.results ?? []);
  });
  automationRoutes.delete("/:id", async (c) => {
    await automations.deleteAutomation(c.env, c.get("workspace").workspaceId, c.req.param("id"), c.get("user").userId);
    return jsonOk(c, { ok: true });
  });
  app.route("/api/automations", automationRoutes);

  // -------------------------------------------------------------------------
  // Analytics
  // -------------------------------------------------------------------------
  const analyticsRoutes = new Hono<AppCtx>();
  analyticsRoutes.use("*", requireAuth, requireWorkspace);
  analyticsRoutes.get("/overview", async (c) => {
    const ws = c.get("workspace").workspaceId;
    const [acctCount, postCount, scheduledCount, failedCount, unreadCount, autoCount] = await Promise.all([
      c.env.DB.prepare("SELECT COUNT(*) AS n FROM connected_accounts WHERE workspace_id = ?").bind(ws).first<{ n: number }>(),
      c.env.DB.prepare("SELECT COUNT(*) AS n FROM posts WHERE workspace_id = ? AND deleted_at IS NULL AND status = 'published'").bind(ws).first<{ n: number }>(),
      c.env.DB.prepare("SELECT COUNT(*) AS n FROM posts WHERE workspace_id = ? AND deleted_at IS NULL AND status IN ('scheduled','queued','approved')").bind(ws).first<{ n: number }>(),
      c.env.DB.prepare("SELECT COUNT(*) AS n FROM posts WHERE workspace_id = ? AND deleted_at IS NULL AND status IN ('failed','partially_published')").bind(ws).first<{ n: number }>(),
      c.env.DB.prepare("SELECT COUNT(*) AS n FROM conversations WHERE workspace_id = ? AND unread_count > 0").bind(ws).first<{ n: number }>(),
      c.env.DB.prepare("SELECT COUNT(*) AS n FROM automations WHERE workspace_id = ? AND status = 'published' AND deleted_at IS NULL").bind(ws).first<{ n: number }>(),
    ]);
    const recentPosts = await c.env.DB.prepare(
      "SELECT id, status, scheduled_for, created_at FROM posts WHERE workspace_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 10",
    ).bind(ws).all<Record<string, unknown>>();
    return jsonOk(c, {
      accounts: acctCount?.n ?? 0,
      publishedPosts: postCount?.n ?? 0,
      scheduledPosts: scheduledCount?.n ?? 0,
      failures: failedCount?.n ?? 0,
      unreadConversations: unreadCount?.n ?? 0,
      activeAutomations: autoCount?.n ?? 0,
      recentPosts: recentPosts.results ?? [],
    });
  });
  analyticsRoutes.get("/accounts/:id", async (c) => {
    const result = await analytics.getAccountMetrics(c.env, c.req.param("id"), c.req.query("since") ?? null);
    return jsonOk(c, result);
  });
  analyticsRoutes.post("/accounts/:id/sync", async (c) => jsonOk(c, await analytics.syncAccountMetrics(c.env, c.get("workspace").workspaceId, c.req.param("id"))));
  app.route("/api/analytics", analyticsRoutes);

  // -------------------------------------------------------------------------
  // Campaigns
  // -------------------------------------------------------------------------
  const campaignRoutes = new Hono<AppCtx>();
  campaignRoutes.use("*", requireAuth, requireWorkspace);
  campaignRoutes.get("/", async (c) => jsonOk(c, await campaigns.listCampaigns(c.env, c.get("workspace").workspaceId)));
  campaignRoutes.post("/", async (c) => {
    const input = await parseJson(c, z.object({ name: z.string().min(1), description: z.string().nullish(), objective: z.string().nullish(), startDate: z.string().nullish(), endDate: z.string().nullish() }));
    return jsonOk(c, await campaigns.createCampaign(c.env, c.get("workspace").workspaceId, c.get("user").userId, input), 201);
  });
  campaignRoutes.get("/:id", async (c) => jsonOk(c, await campaigns.getCampaign(c.env, c.get("workspace").workspaceId, c.req.param("id"))));
  campaignRoutes.patch("/:id", async (c) => {
    const input = await parseJson(c, z.object({ name: z.string().min(1), description: z.string().nullish(), objective: z.string().nullish(), startDate: z.string().nullish(), endDate: z.string().nullish() }));
    return jsonOk(c, await campaigns.updateCampaign(c.env, c.get("workspace").workspaceId, c.req.param("id"), input));
  });
  campaignRoutes.delete("/:id", async (c) => {
    await campaigns.deleteCampaign(c.env, c.get("workspace").workspaceId, c.req.param("id"), c.get("user").userId);
    return jsonOk(c, { ok: true });
  });
  app.route("/api/campaigns", campaignRoutes);

  // -------------------------------------------------------------------------
  // Approvals
  // -------------------------------------------------------------------------
  const approvalRoutes = new Hono<AppCtx>();
  approvalRoutes.use("*", requireAuth, requireWorkspace);
  approvalRoutes.get("/", async (c) => jsonOk(c, await approvals.listApprovals(c.env, c.get("workspace").workspaceId, c.req.query("status") ?? undefined)));
  approvalRoutes.post("/", async (c) => {
    const input = await parseJson(c, z.object({ postId: z.string() }));
    return jsonOk(c, await approvals.requestApproval(c.env, c.get("workspace").workspaceId, input.postId, c.get("user").userId), 201);
  });
  approvalRoutes.post("/:id/resolve", async (c) => {
    if (!roleAtLeast(c.get("workspace").role, "manager")) throw forbidden("You do not have permission to review approvals");
    const input = await parseJson(c, z.object({ action: z.enum(["approve", "reject", "request_changes"]), comment: z.string().nullish() }));
    return jsonOk(c, await approvals.resolveApproval(c.env, c.get("workspace").workspaceId, c.req.param("id"), input.action, input.comment ?? null, c.get("user").userId));
  });
  app.route("/api/approvals", approvalRoutes);

  // -------------------------------------------------------------------------
  // Team
  // -------------------------------------------------------------------------
  const teamRoutes = new Hono<AppCtx>();
  teamRoutes.use("*", requireAuth, requireWorkspace);
  teamRoutes.get("/", async (c) => jsonOk(c, await team.listMembers(c.env, c.get("workspace").workspaceId)));
  teamRoutes.get("/invitations", async (c) => jsonOk(c, await team.listInvitations(c.env, c.get("workspace").workspaceId)));
  teamRoutes.post("/invite", async (c) => {
    if (!roleAtLeast(c.get("workspace").role, "admin")) throw forbidden("Only admins can invite members");
    const input = await parseJson(c, z.object({ email: z.string().email(), role: z.string() }));
    return jsonOk(c, await team.inviteMember(c.env, c.get("workspace").workspaceId, c.get("user").userId, input.email, input.role), 201);
  });
  teamRoutes.patch("/:memberId", async (c) => {
    if (!roleAtLeast(c.get("workspace").role, "admin")) throw forbidden("Only admins can change roles");
    const input = await parseJson(c, z.object({ role: z.string() }));
    await team.updateRole(c.env, c.get("workspace").workspaceId, c.req.param("memberId"), input.role, c.get("user").userId);
    return jsonOk(c, { ok: true });
  });
  teamRoutes.delete("/:memberId", async (c) => {
    if (!roleAtLeast(c.get("workspace").role, "admin")) throw forbidden("Only admins can remove members");
    await team.removeMember(c.env, c.get("workspace").workspaceId, c.req.param("memberId"), c.get("user").userId);
    return jsonOk(c, { ok: true });
  });
  app.route("/api/team", teamRoutes);

  // -------------------------------------------------------------------------
  // Notifications
  // -------------------------------------------------------------------------
  const notificationRoutes = new Hono<AppCtx>();
  notificationRoutes.use("*", requireAuth, requireWorkspace);
  notificationRoutes.get("/", async (c) => {
    const rows = await c.env.DB.prepare(
      "SELECT id, type, title, body, is_read, created_at FROM notifications WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 100",
    ).bind(c.get("workspace").workspaceId).all<Record<string, unknown>>();
    return jsonOk(c, rows.results ?? []);
  });
  notificationRoutes.post("/read-all", async (c) => {
    await c.env.DB.prepare("UPDATE notifications SET is_read = 1 WHERE workspace_id = ?").bind(c.get("workspace").workspaceId).run();
    return jsonOk(c, { ok: true });
  });
  notificationRoutes.post("/:id/read", async (c) => {
    await c.env.DB.prepare("UPDATE notifications SET is_read = 1 WHERE id = ? AND workspace_id = ?").bind(c.req.param("id"), c.get("workspace").workspaceId).run();
    return jsonOk(c, { ok: true });
  });
  app.route("/api/notifications", notificationRoutes);

  // -------------------------------------------------------------------------
  // Settings & audit
  // -------------------------------------------------------------------------
  const settingsRoutes = new Hono<AppCtx>();
  settingsRoutes.use("*", requireAuth, requireWorkspace);
  settingsRoutes.get("/", async (c) => jsonOk(c, await workspaces.getSettings(c.env, c.get("workspace").workspaceId)));
  settingsRoutes.patch("/", async (c) => {
    const input = await parseJson(c, z.object({ settings: z.record(z.string(), z.unknown()) }));
    return jsonOk(c, await workspaces.updateSettings(c.env, c.get("workspace").workspaceId, input.settings, c.get("user").userId));
  });
  settingsRoutes.get("/audit-logs", async (c) => {
    const rows = await c.env.DB.prepare(
      "SELECT id, actor_id, action, resource_type, resource_id, created_at FROM audit_logs WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 200",
    ).bind(c.get("workspace").workspaceId).all<Record<string, unknown>>();
    return jsonOk(c, rows.results ?? []);
  });
  app.route("/api/settings", settingsRoutes);

  // -------------------------------------------------------------------------
  // Webhooks (public ingestion)
  // -------------------------------------------------------------------------
  app.post("/api/webhooks/:providerId", rateLimit("webhook"), async (c) => {
    const providerId = c.req.param("providerId");
    const rawBody = await c.req.text();

    // Resolve the workspace from a secret token in the URL query.
    const token = c.req.query("token") ?? "";
    const endpoint = await c.env.DB.prepare(
      "SELECT workspace_id, account_id, provider_id, secret_ciphertext FROM webhook_endpoints WHERE provider_id = ? AND url = ? LIMIT 1",
    ).bind(providerId, c.req.url.split("?")[0]).first<{ workspace_id: string; account_id: string | null; provider_id: string; secret_ciphertext: string | null }>();
    if (!endpoint) return c.json({ error: { code: "unknown_webhook", message: "Unknown webhook" } }, 404);
    void token;

    const body = JSON.parse(rawBody);
    await inbox.ingestInbound(c.env, {
      workspaceId: endpoint.workspace_id,
      providerId,
      accountId: endpoint.account_id,
      externalConversationId: (body.chat_id ?? body.conversation_id ?? body.message_id ?? crypto.randomUUID()) as string,
      externalContactId: (body.from?.id ?? body.user?.id ?? body.sender?.id) as string | undefined,
      contactName: (body.from?.first_name ?? body.user?.name) as string | undefined,
      contactUsername: (body.from?.username ?? body.user?.username) as string | undefined,
      messageBody: (body.text ?? body.message?.text) as string | undefined,
    });
    return jsonOk(c, { ok: true });
  });
}