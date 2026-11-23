/**
 * Postflare — end-to-end test runner with a mock provider backend.
 *
 * Boots a local Worker (`wrangler dev`) and the mock social-provider server,
 * then walks every feature/flow with fake credentials and asserts real
 * behaviour (publishes land in the mock provider, encryption never leaks, etc).
 *
 *   node scripts/e2e.mjs
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const WORKER_PORT = Number(process.env.WORKER_PORT ?? 8788);
const MOCK_PORT = Number(process.env.MOCK_PORT ?? 4000);
const WORKER_URL = `http://localhost:${WORKER_PORT}`;
const MOCK_URL = `http://localhost:${MOCK_PORT}`;

const env = { ...process.env, WRANGLER_SEND_METRICS: "false" };

const results = [];
async function test(name, fn) {
  results.push({ name, status: "pending" });
  try {
    await fn();
    results[results.length - 1].status = "pass";
    console.log(`  ✅ ${name}`);
  } catch (e) {
    results[results.length - 1].status = "fail";
    results[results.length - 1].error = e.message;
    console.log(`  ❌ ${name} — ${e.message}`);
  }
}
function assert(cond, message) {
  if (!cond) throw new Error(message);
}

// ---- fetch helpers ---------------------------------------------------------
let cookie = "";
async function rawFetch(path, init = {}) {
  const headers = { ...(init.headers ?? {}) };
  if (cookie) headers.cookie = cookie;
  const res = await fetch(`${WORKER_URL}${path}`, { ...init, headers });
  const sc = res.headers.get("set-cookie");
  if (sc) cookie = sc.split(";")[0];
  let data = null;
  const text = await res.text();
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, res };
}

async function api(method, path, { body, workspaceId } = {}) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (workspaceId) headers["x-workspace-id"] = workspaceId;
  return rawFetch(path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
}
const ok = (r) => { assert(r.status >= 200 && r.status < 300, `expected 2xx, got ${r.status}: ${JSON.stringify(r.data).slice(0, 200)}`); return r; };

async function waitFor(fn, timeoutMs = 30000, interval = 750) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await fn();
    if (last) return last;
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error(`timed out waiting for condition (last: ${JSON.stringify(last).slice(0, 200)})`);
}

async function waitForPort(url, readyInLog) {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch { /* not up yet */ }
    if (readyInLog?.()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`server did not become ready: ${url}`);
}

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
  "base64",
);

// ---- lifecycle -------------------------------------------------------------
function patchConfig() {
  const p = join(root, "wrangler.jsonc");
  const original = readFileSync(p, "utf8");
  let patched = original.replace(/"PUBLIC_BASE_URL"\s*:\s*"[^"]*"/, `"PUBLIC_BASE_URL": "${WORKER_URL}"`);
  patched = patched.replace(/"COMPOSIO_BASE_URL"\s*:\s*"[^"]*"/, `"COMPOSIO_BASE_URL": "${MOCK_URL}/composio/api/v3.1"`);
  writeFileSync(p, patched);
  return { p, original };
}

function ensureDevVars() {
  const p = join(root, ".dev.vars");
  let content = existsSync(p) ? readFileSync(p, "utf8") : "";
  if (!/^ENCRYPTION_KEY=.+/m.test(content)) {
    const key = Buffer.from(new Uint8Array(32).map((_, i) => i + 1)).toString("base64");
    content += `${content ? "\n" : ""}ENCRYPTION_KEY=${key}`;
  }
  writeFileSync(p, content);
}

function ensureDist() {
  const dir = join(root, "dist");
  mkdirSync(dir, { recursive: true });
  const index = join(dir, "index.html");
  if (!existsSync(index)) writeFileSync(index, "<!doctype html><title>postflare</title>");
}

/** Wipe the local D1 state so every run starts from a clean schema. */
function resetLocalD1() {
  const d1State = join(root, ".wrangler", "state", "v3", "d1");
  if (existsSync(d1State)) rmSync(d1State, { recursive: true, force: true });
}

function runSync(cmd, args, { retries = 3 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const r = spawnSync(cmd, args, { cwd: root, env, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
    if (r.status === 0) return r.stdout;
    lastErr = new Error(`${cmd} ${args.join(" ")} failed:\n${r.stdout}\n${r.stderr}`);
    // Local SQLite can be briefly locked by the running dev server; retry.
    const busy = /SQLITE_BUSY|database is locked/.test(String(r.stderr) + String(r.stdout));
    if (!busy || attempt === retries) break;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 600);
  }
  throw lastErr;
}

let mockProc = null;
let wranglerProc = null;

function startProcess(cmd, args, readyLog, readyHttp) {
  const proc = spawn(cmd, args, { cwd: root, env, stdio: ["ignore", "pipe", "pipe"], detached: true });
  let buffer = "";
  const onData = (d) => {
    buffer += d.toString();
    if (buffer.length > 20000) buffer = buffer.slice(-20000);
  };
  proc.stdout.on("data", onData);
  proc.stderr.on("data", onData);
  return new Promise((resolve) => {
    const check = async () => {
      if (readyLog(buffer) || await readyHttp().catch(() => false)) resolve(proc);
      else setTimeout(check, 400);
    };
    check();
  });
}

async function main() {
  console.log("Postflare E2E\n");

  ensureDevVars();
  ensureDist();
  const { p, original } = patchConfig();

  try {
    resetLocalD1();
    console.log("Applying local migrations…");
    runSync("npx", ["wrangler", "d1", "migrations", "apply", "postflare-db", "--local"]);

    console.log("Starting wrangler dev…");
    wranglerProc = await startProcess(
      "npx",
      ["wrangler", "dev", "--port", String(WORKER_PORT)],
      (log) => log.includes(`http://localhost:${WORKER_PORT}`),
      () => fetch(`${WORKER_URL}/api/integrations`).then(() => true),
    );

    console.log("Starting mock provider…");
    mockProc = await startProcess(
      "node",
      ["scripts/mock-provider.mjs", String(MOCK_PORT)],
      () => false,
      () => fetch(`${MOCK_URL}/health`).then(() => true),
    );
    await fetch(`${MOCK_URL}/__reset`);

    await runSuite();

    // ---- report ----
    const failed = results.filter((r) => r.status !== "pass");
    console.log(`\n===== ${results.length - failed.length}/${results.length} passed =====`);
    if (failed.length) {
      console.log("Failed:");
      for (const f of failed) console.log(`  - ${f.name}: ${f.error ?? ""}`);
      process.exitCode = 1;
    }
  } finally {
    console.log("\nTearing down…");
    const killGroup = (proc) => {
      if (!proc) return;
      try { process.kill(-proc.pid, "SIGKILL"); } catch { try { proc.kill("SIGKILL"); } catch { /* already gone */ } }
    };
    killGroup(mockProc);
    killGroup(wranglerProc);
    writeFileSync(p, original);
  }
}

async function runSuite() {
  let ws = "";
  let userId = "";

  // ---- Auth ----------------------------------------------------------------
  await test("register creates a user + workspace", async () => {
    const r = ok(await api("POST", "/api/auth/register", { body: { email: "e2e@example.com", name: "E2E", password: "password123" } }));
    assert(r.status === 201, "expected 201");
  });
  await test("me returns session + workspace", async () => {
    const r = ok(await api("GET", "/api/auth/me"));
    ws = r.data.data.workspaces[0].id;
    userId = r.data.data.user.id;
    assert(!!ws, "workspace id present");
  });
  await test("logout then login", async () => {
    ok(await api("POST", "/api/auth/logout"));
    ok(await api("POST", "/api/auth/login", { body: { email: "e2e@example.com", password: "password123" } }));
  });

  // ---- Integrations & credentials -----------------------------------------
  await test("integrations list exposes the platform registry", async () => {
    const r = ok(await api("GET", "/api/integrations", { workspaceId: ws }));
    assert(r.data.data.length >= 28, "28+ platforms");
  });
  await test("store + list masked credentials (no plaintext leak)", async () => {
    const creds = {
      bluesky: { identifier: "mock.bsky.social", appPassword: "MOCK-BLUESKY-SECRET", apiBaseUrl: `${MOCK_URL}/bluesky` },
      mastodon: { baseUrl: `${MOCK_URL}/mastodon`, accessToken: "MOCK-MASTO-SECRET" },
      telegram: { botToken: "MOCK-TELEGRAM-TOKEN", chatId: "@e2echannel", apiBaseUrl: `${MOCK_URL}/telegram` },
      wordpress: { baseUrl: `${MOCK_URL}/wordpress`, username: "admin", appPassword: "MOCK-WP-SECRET" },
      webhook: { webhookUrl: `${MOCK_URL}/webhook` },
    };
    for (const [providerId, fields] of Object.entries(creds)) {
      ok(await api("PUT", `/api/credentials/${providerId}`, { body: { fields }, workspaceId: ws }));
    }
    const list = ok(await api("GET", "/api/credentials", { workspaceId: ws }));
    const serialized = JSON.stringify(list.data.data);
    assert(!serialized.includes("MOCK-BLUESKY-SECRET") && !serialized.includes("MOCK-MASTO-SECRET"), "no plaintext secrets in response");
    assert(serialized.includes("••••"), "values are masked");
  });
  await test("credential test connection hits the mock provider", async () => {
    const r = ok(await api("POST", "/api/credentials/bluesky/test", { body: { fields: { identifier: "mock.bsky.social", appPassword: "MOCK-BLUESKY-SECRET", apiBaseUrl: `${MOCK_URL}/bluesky` } }, workspaceId: ws }));
    assert(r.data.data.ok === true, "mock bluesky credentials validate");
  });

  // ---- Accounts ------------------------------------------------------------
  let accounts = {};
  await test("connect 5 mock accounts", async () => {
    const defs = {
      bluesky: { identifier: "mock.bsky.social", appPassword: "MOCK-BLUESKY-SECRET", apiBaseUrl: `${MOCK_URL}/bluesky` },
      mastodon: { baseUrl: `${MOCK_URL}/mastodon`, accessToken: "MOCK-MASTO-SECRET" },
      telegram: { botToken: "MOCK-TELEGRAM-TOKEN", chatId: "@e2echannel", apiBaseUrl: `${MOCK_URL}/telegram` },
      wordpress: { baseUrl: `${MOCK_URL}/wordpress`, username: "admin", appPassword: "MOCK-WP-SECRET" },
      webhook: { webhookUrl: `${MOCK_URL}/webhook` },
    };
    for (const [providerId, fields] of Object.entries(defs)) {
      const r = ok(await api("POST", "/api/accounts/connect", { body: { providerId, fields }, workspaceId: ws }));
      accounts[providerId] = r.data.data.accountId;
    }
  });
  await test("accounts list shows 5 connected accounts", async () => {
    const r = ok(await api("GET", "/api/accounts", { workspaceId: ws }));
    assert(r.data.data.length === 5, "5 accounts");
  });

  // ---- Media ---------------------------------------------------------------
  let mediaId = "";
  await test("upload media to R2", async () => {
    const form = new FormData();
    form.append("file", new Blob([PNG], { type: "image/png" }), "pixel.png");
    const r = await rawFetch("/api/media", { method: "POST", headers: { "x-workspace-id": ws }, body: form });
    assert(r.status === 201, `media upload 201, got ${r.status}`);
    mediaId = r.data.data.id;
  });

  // ---- Posts: composer fields ---------------------------------------------
  let draftId = "";
  await test("create draft with advanced composer fields", async () => {
    const r = ok(await api("POST", "/api/posts", {
      workspaceId: ws,
      body: {
        variants: [
          { providerId: "bluesky", text: "Draft body #launch", link: "https://example.com", firstComment: "First comment", location: "London", altText: "pixel", mediaIds: [mediaId] },
          { providerId: "mastodon", text: "Mastodon draft" },
        ],
        accountIds: [accounts.bluesky, accounts.mastodon],
      },
    }));
    draftId = r.data.data.id;
    const post = r.data.data;
    const bsky = post.variants.find((v) => v.providerId === "bluesky");
    assert(bsky.firstComment === "First comment", "firstComment persisted");
    assert(bsky.location === "London", "location persisted");
    assert(bsky.altText === "pixel", "altText persisted");
    assert(bsky.mediaIds.length === 1, "media attached");
    assert(post.status === "draft", "draft status");
  });

  await test("schedule a post", async () => {
    const future = new Date(Date.now() + 2 * 86400_000).toISOString();
    const r = ok(await api("POST", "/api/posts", {
      workspaceId: ws,
      body: { variants: [{ providerId: "bluesky", text: "Scheduled" }], accountIds: [accounts.bluesky], scheduledFor: future },
    }));
    assert(r.data.data.status === "scheduled", "scheduled status");
    const cal = ok(await api("GET", "/api/calendar", { workspaceId: ws }));
    assert(cal.data.data.length >= 1, "calendar lists scheduled post");
  });

  // ---- Immediate publish through the queue → mock providers -----------------
  let publishPostId = "";
  await test("publish now reaches all mock providers", async () => {
    const r = ok(await api("POST", "/api/posts", {
      workspaceId: ws,
      body: {
        variants: [
          { providerId: "bluesky", text: "Hello Bluesky", link: "https://example.com" },
          { providerId: "mastodon", text: "Hello Mastodon" },
          { providerId: "telegram", text: "Hello Telegram" },
          { providerId: "wordpress", text: "Hello WordPress", title: "WP Title" },
          { providerId: "webhook", text: "Hello Webhook" },
        ],
        accountIds: [accounts.bluesky, accounts.mastodon, accounts.telegram, accounts.wordpress, accounts.webhook],
        publishNow: true,
      },
    }));
    publishPostId = r.data.data.id;

    await waitFor(async () => {
      const p = ok(await api("GET", "/api/posts", { workspaceId: ws }));
      const post = p.data.data.items.find((x) => x.id === publishPostId);
      return ["published", "partially_published", "failed"].includes(post?.status) ? post : null;
    }, 40000);

    const inspect = await (await fetch(`${MOCK_URL}/__inspect`)).json();
    assert(inspect.bluesky.posts.some((p) => p.text === "Hello Bluesky"), "bluesky received post");
    assert(inspect.mastodon.posts.some((p) => p.status === "Hello Mastodon"), "mastodon received status");
    assert(inspect.telegram.messages.some((m) => m.text === "Hello Telegram"), "telegram received message");
    assert(inspect.wordpress.posts.some((p) => p.title === "WP Title"), "wordpress received post");
    assert(inspect.webhook.some((p) => p.text === "Hello Webhook"), "webhook received post");
  });

  // ---- Media publish (PUBLIC_BASE_URL resolved) -----------------------------
  await test("publish media to Bluesky (image upload + embed)", async () => {
    const r = ok(await api("POST", "/api/posts", {
      workspaceId: ws,
      body: {
        variants: [{ providerId: "bluesky", text: "Image post", altText: "a pixel", mediaIds: [mediaId] }],
        accountIds: [accounts.bluesky],
        publishNow: true,
      },
    }));
    const id = r.data.data.id;
    await waitFor(async () => {
      const p = ok(await api("GET", "/api/posts", { workspaceId: ws }));
      const post = p.data.data.items.find((x) => x.id === id);
      return ["published", "failed"].includes(post?.status) ? post : null;
    }, 40000);
    const inspect = await (await fetch(`${MOCK_URL}/__inspect`)).json();
    const withImage = inspect.bluesky.posts.find((p) => p.text === "Image post");
    assert(withImage && withImage.embed?.$type === "app.bsky.embed.images", "bluesky received image embed");
  });

  // ---- Inbox (webhook → conversation → reply) -------------------------------
  await test("webhook ingestion + inbox reply", async () => {
    // Register a webhook endpoint (seeded directly into D1).
    runSync("npx", ["wrangler", "d1", "execute", "postflare-db", "--local", "--command",
      `INSERT INTO webhook_endpoints (id, workspace_id, provider_id, account_id, url, secret_ciphertext, created_at) VALUES ('wh_e2e', '${ws}', 'telegram', '${accounts.telegram}', '${WORKER_URL}/api/webhooks/telegram', NULL, '2026-01-01T00:00:00.000Z')`]);

    const hook = await rawFetch("/api/webhooks/telegram?token=x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: "777", from: { id: "777", first_name: "Fan" }, text: "Hello bot" }),
    });
    assert(hook.status === 200, `webhook 200, got ${hook.status}`);

    const conv = ok(await api("GET", "/api/inbox/conversations", { workspaceId: ws }));
    const convo = conv.data.data.items[0];
    assert(convo && convo.providerId === "telegram", "conversation created");

    const msgs = ok(await api("GET", `/api/inbox/conversations/${convo.id}/messages`, { workspaceId: ws }));
    assert(msgs.data.data.length === 1 && msgs.data.data[0].body === "Hello bot", "inbound message stored");

    ok(await api("POST", `/api/inbox/conversations/${convo.id}/reply`, { body: { text: "Hi Fan!" }, workspaceId: ws }));

    const inspect = await (await fetch(`${MOCK_URL}/__inspect`)).json();
    assert(inspect.telegram.messages.some((m) => m.text === "Hi Fan!" && m.chat_id === "777"), "reply sent via telegram");
  });

  // ---- Contacts -------------------------------------------------------------
  await test("contacts CRUD + tags + CSV", async () => {
    const c = ok(await api("POST", "/api/contacts", { body: { name: "Ada", email: "ada@e2e.dev" }, workspaceId: ws }));
    const contactId = c.data.data.id;
    ok(await api("POST", `/api/contacts/${contactId}/tags`, { body: { tag: "lead" }, workspaceId: ws }));
    const list = ok(await api("GET", "/api/contacts", { workspaceId: ws }));
    assert(list.data.data.items.some((x) => x.tags.includes("lead")), "tag applied");
    const csv = await rawFetch("/api/contacts/export", { headers: { "x-workspace-id": ws } });
    assert(csv.data.includes("Ada"), "csv export contains contact");
  });

  // ---- Automations ----------------------------------------------------------
  await test("automation create → publish → execute", async () => {
    const def = {
      nodes: [
        { id: "n1", type: "trigger.keyword", position: { x: 0, y: 0 }, data: { keywords: "hi" } },
        { id: "n2", type: "contact.add_tag", position: { x: 200, y: 0 }, data: { tag: "automated" } },
        { id: "n3", type: "flow.end", position: { x: 400, y: 0 }, data: {} },
      ],
      edges: [{ id: "e1", source: "n1", target: "n2" }, { id: "e2", source: "n2", target: "n3" }],
    };
    const created = ok(await api("POST", "/api/automations", { body: { name: "Keyword tag", triggerType: "trigger.keyword", definition: def }, workspaceId: ws }));
    const autoId = created.data.data.id;
    ok(await api("POST", `/api/automations/${autoId}/publish`, { body: { definition: def }, workspaceId: ws }));
    const contact = ok(await api("POST", "/api/contacts", { body: { name: "Flow Contact" }, workspaceId: ws }));
    const run = ok(await api("POST", `/api/automations/${autoId}/test`, { body: { message: "hi there", variables: { message: "hi there", contactId: contact.data.data.id } }, workspaceId: ws }));
    assert(run.data.data.status === "completed", "execution completed");
    const execs = ok(await api("GET", `/api/automations/${autoId}/executions`, { workspaceId: ws }));
    assert(execs.data.data.length === 1, "execution recorded");
  });

  // ---- Campaigns, approvals, team, notifications, settings -------------------
  await test("campaigns CRUD", async () => {
    const c = ok(await api("POST", "/api/campaigns", { body: { name: "Launch" }, workspaceId: ws }));
    assert(c.data.data.id, "campaign created");
  });
  await test("approval request + resolve", async () => {
    const post = ok(await api("POST", "/api/posts", { workspaceId: ws, body: { variants: [{ providerId: "bluesky", text: "Needs approval" }], accountIds: [accounts.bluesky] } }));
    const appr = ok(await api("POST", "/api/approvals", { body: { postId: post.data.data.id }, workspaceId: ws }));
    ok(await api("POST", `/api/approvals/${appr.data.data.id}/resolve`, { body: { action: "approve" }, workspaceId: ws }));
    const p = ok(await api("GET", "/api/posts", { workspaceId: ws }));
    assert(p.data.data.items.find((x) => x.id === post.data.data.id).status === "approved", "post approved");
  });
  await test("team invite", async () => {
    ok(await api("POST", "/api/team/invite", { body: { email: "teammate@e2e.dev", role: "editor" }, workspaceId: ws }));
    const inv = ok(await api("GET", "/api/team/invitations", { workspaceId: ws }));
    assert(inv.data.data.length === 1, "invitation recorded");
  });
  await test("notifications + settings + audit logs", async () => {
    const n = ok(await api("GET", "/api/notifications", { workspaceId: ws }));
    assert(Array.isArray(n.data.data), "notifications list");
    ok(await api("POST", "/api/notifications/read-all", { workspaceId: ws }));
    ok(await api("PATCH", "/api/settings", { body: { settings: { timezone: "Europe/London" } }, workspaceId: ws }));
    const audit = ok(await api("GET", "/api/settings/audit-logs", { workspaceId: ws }));
    assert(audit.data.data.length > 0, "audit logs present");
  });

  // ---- Workspace isolation ---------------------------------------------------
  await test("workspace isolation (cross-tenant access denied)", async () => {
    // Register a second user and try to read the first workspace's posts.
    const altCookie = cookie;
    ok(await api("POST", "/api/auth/register", { body: { email: "eve@e2e.dev", name: "Eve", password: "password123" } }));
    const r = await api("GET", "/api/posts", { workspaceId: ws });
    assert(r.status === 403, `expected 403, got ${r.status}`);
    cookie = altCookie; // restore
  });

  // ---- Composio hub ------------------------------------------------------------
  let composioAccounts = {};
  await test("save + test Composio API key (mock backend)", async () => {
    const st = ok(await api("GET", "/api/composio", { workspaceId: ws }));
    assert(st.data.data.configured === false, "composio not configured initially");
    assert(Array.isArray(st.data.data.supported) && st.data.data.supported.length >= 7, "7 supported platforms");
    const save = ok(await api("PUT", "/api/composio/key", { body: { apiKey: "MOCK-COMPOSIO-KEY" }, workspaceId: ws }));
    assert(save.data.data.ok === true, "key validates against the mock Composio");
  });
  await test("list Composio connected accounts (only supported platforms mapped)", async () => {
    const list = ok(await api("GET", "/api/composio/connected-accounts", { workspaceId: ws }));
    const items = list.data.data;
    assert(items.length === 8, `expected 8 mock composio accounts, got ${items.length}`);
    const github = items.find((a) => a.toolkit === "GITHUB");
    assert(github && github.providerId === null, "unsupported toolkits are surfaced unmapped");
    const twitter = items.find((a) => a.toolkit === "TWITTER");
    assert(twitter && twitter.providerId === "x", "toolkit mapped to postflare platform");
  });
  await test("import Composio accounts (x, telegram with chatId, instagram)", async () => {
    const imports = [
      { composioAccountId: "ca_twitter_1", providerId: "x", accountName: "Composio X" },
      { composioAccountId: "ca_telegram_1", providerId: "telegram", config: { chatId: "@composiochannel" } },
      { composioAccountId: "ca_instagram_1", providerId: "instagram" },
    ];
    for (const body of imports) {
      const r = ok(await api("POST", "/api/composio/import", { body, workspaceId: ws }));
      composioAccounts[body.providerId] = r.data.data.accountId;
    }
    const accounts = ok(await api("GET", "/api/accounts", { workspaceId: ws }));
    const viaComposio = accounts.data.data.filter((a) => a.connectionMode === "composio");
    assert(viaComposio.length === 3, "3 composio accounts registered");
  });
  await test("duplicate Composio import is rejected", async () => {
    const r = await api("POST", "/api/composio/import", { body: { composioAccountId: "ca_twitter_1", providerId: "x" }, workspaceId: ws });
    assert(r.status === 400, `expected 400 for duplicate import, got ${r.status}`);
  });
  await test("missing required config (telegram chatId) is rejected", async () => {
    const r = await api("POST", "/api/composio/import", { body: { composioAccountId: "ca_reddit_1", providerId: "reddit" }, workspaceId: ws });
    assert(r.status === 400, `expected 400 without subreddit, got ${r.status}`);
  });
  await test("publish via Composio reaches the tool API (x + telegram)", async () => {
    const r = ok(await api("POST", "/api/posts", {
      workspaceId: ws,
      body: {
        variants: [
          { providerId: "x", text: "Hello from Composio X" },
          { providerId: "telegram", text: "Hello from Composio Tg" },
        ],
        accountIds: [composioAccounts.x, composioAccounts.telegram],
        publishNow: true,
      },
    }));
    const id = r.data.data.id;
    await waitFor(async () => {
      const p = ok(await api("GET", "/api/posts", { workspaceId: ws }));
      const post = p.data.data.items.find((x) => x.id === id);
      return ["published", "partially_published", "failed"].includes(post?.status) ? post : null;
    }, 40000);
    const inspect = await (await fetch(`${MOCK_URL}/__inspect`)).json();
    const xAction = inspect.composio.actions.find((a) => a.slug === "TWITTER_CREATION_OF_A_POST");
    assert(xAction && xAction.args.text === "Hello from Composio X", "X publish tool called with text");
    assert(xAction.connected_account_id === "ca_twitter_1", "executed with the composio account id");
    const tgAction = inspect.composio.actions.find((a) => a.slug === "TELEGRAM_SEND_MESSAGE");
    assert(tgAction && tgAction.args.chat_id === "@composiochannel", "telegram tool called with imported chatId config");
  });
  await test("publish media via Composio Instagram (container + publish two-step)", async () => {
    const r = ok(await api("POST", "/api/posts", {
      workspaceId: ws,
      body: {
        variants: [{ providerId: "instagram", text: "Composio IG caption", altText: "a pixel", mediaIds: [mediaId] }],
        accountIds: [composioAccounts.instagram],
        publishNow: true,
      },
    }));
    const id = r.data.data.id;
    await waitFor(async () => {
      const p = ok(await api("GET", "/api/posts", { workspaceId: ws }));
      const post = p.data.data.items.find((x) => x.id === id);
      return ["published", "failed"].includes(post?.status) ? post : null;
    }, 40000);
    const inspect = await (await fetch(`${MOCK_URL}/__inspect`)).json();
    const container = inspect.composio.actions.find((a) => a.slug === "INSTAGRAM_POST_IG_USER_MEDIA");
    assert(container && container.args.caption === "Composio IG caption", "container tool called with caption");
    assert(typeof container.args.image_url === "string" && container.args.image_url.startsWith(WORKER_URL), "media url resolved to the worker");
    const publish = inspect.composio.actions.find((a) => a.slug === "INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH");
    assert(publish && publish.args.creation_id === "17890000000000001", "publish tool called with the container id");
  });

  // ---- Simple (linear) automation format ----------------------------------------
  let simpleAutoId = "";
  await test("create + publish a simple-format automation (compiled to the graph)", async () => {
    const simple = {
      triggerType: "trigger.keyword",
      triggerConfig: { keywords: "hi" },
      steps: [
        { id: "s1", type: "contact.add_tag", config: { tag: "simple-run" }, guard: { keywords: "hi", match: "contains" } },
        { id: "s2", type: "message.text", config: { text: "Hello from simple" } },
      ],
    };
    const created = ok(await api("POST", "/api/automations", { body: { name: "Simple flow", triggerType: simple.triggerType, simple }, workspaceId: ws }));
    simpleAutoId = created.data.data.id;
    ok(await api("POST", `/api/automations/${simpleAutoId}/publish`, { body: { simple }, workspaceId: ws }));
    const latest = ok(await api("GET", `/api/automations/${simpleAutoId}/latest`, { workspaceId: ws }));
    const def = latest.data.data.definition;
    assert(def.simple && def.simple.steps.length === 2, "simple model stored alongside the compiled graph");
    assert(def.nodes.some((n) => n.type === "logic.keyword"), "guard compiled into a keyword node");
    const guardEdges = def.edges.filter((e) => e.sourceHandle === "not-matched");
    assert(guardEdges.length === 1, "guard has a not-matched skip edge");
    const run = ok(await api("POST", `/api/automations/${simpleAutoId}/test`, { body: { message: "hi there", variables: { message: "hi there" } }, workspaceId: ws }));
    assert(run.data.data.status === "completed", "compiled flow executes end-to-end");
  });
  await test("existing automations can be attached from the composer", async () => {
    const r = ok(await api("POST", "/api/posts", {
      workspaceId: ws,
      body: {
        variants: [{ providerId: "bluesky", text: "Post with attached automation" }],
        accountIds: [],
        attachAutomationIds: [simpleAutoId],
      },
    }));
    const postId = r.data.data.id;
    const links = JSON.parse(runSync("npx", ["wrangler", "d1", "execute", "postflare-db", "--local", "--json", "--command",
      `SELECT automation_id FROM post_automations WHERE post_id = '${postId}'`]));
    const ids = links[0].results.map((row) => row.automation_id);
    assert(ids.includes(simpleAutoId), "published automation linked to the post");
  });

  // ---- Composio auth gateway (Postflare user, hosted authorization) --------------
  await test("auth gateway initiates a link under the postflare user", async () => {
    const conn = ok(await api("POST", "/api/composio/connect", { body: { providerId: "x" }, workspaceId: ws }));
    const { redirectUrl, composioAccountId } = conn.data.data;
    assert(composioAccountId && composioAccountId.startsWith("ca_new_"), "link created a composio account");
    assert(new URL(redirectUrl).host === new URL(MOCK_URL).host, "redirects to the hosted auth page");

    // Simulate the user completing authorization on Composio's hosted page.
    const complete = await fetch(redirectUrl, { redirect: "manual" });
    assert(complete.status === 302, `auth completion redirects, got ${complete.status}`);
    const location = complete.headers.get("location") ?? "";
    assert(location.startsWith(WORKER_URL) && location.includes("composio=connected&provider=x"), `callback returns to postflare: ${location}`);
  });
  await test("gateway auto-enables a missing managed auth config (no dashboard)", async () => {
    // INSTAGRAM starts with NO auth config in the mock — connecting must
    // create a Composio-managed one via the API and then link under it.
    const conn = ok(await api("POST", "/api/composio/connect", { body: { providerId: "instagram" }, workspaceId: ws }));
    const igAccountId = conn.data.data.composioAccountId;
    assert(igAccountId && igAccountId.startsWith("ca_new_"), "link created after auto-enabling");

    const inspect = await (await fetch(`${MOCK_URL}/__inspect`)).json();
    const creation = inspect.composio.authConfigCreations.find((c) => c.slug === "INSTAGRAM");
    assert(creation && creation.type === "use_composio_managed_auth", "managed auth config created via the API");

    // Complete the hosted authorization and import the account.
    const complete = await fetch(conn.data.data.redirectUrl, { redirect: "manual" });
    assert(complete.status === 302, `auth completion redirects, got ${complete.status}`);
    const imp = ok(await api("POST", "/api/composio/import", {
      body: { composioAccountId: igAccountId, providerId: "instagram", accountName: "Gateway IG" },
      workspaceId: ws,
    }));

    // Publish media through it — the Instagram two-step tool flow.
    const r = ok(await api("POST", "/api/posts", {
      workspaceId: ws,
      body: {
        variants: [{ providerId: "instagram", text: "Auto-enabled IG caption", mediaIds: [mediaId] }],
        accountIds: [imp.data.data.accountId],
        publishNow: true,
      },
    }));
    const id = r.data.data.id;
    await waitFor(async () => {
      const p = ok(await api("GET", "/api/posts", { workspaceId: ws }));
      const post = p.data.data.items.find((x) => x.id === id);
      return ["published", "failed"].includes(post?.status) ? post : null;
    }, 40000);
    const inspect2 = await (await fetch(`${MOCK_URL}/__inspect`)).json();
    const container = inspect2.composio.actions.filter((a) => a.slug === "INSTAGRAM_POST_IG_USER_MEDIA").pop();
    assert(container && container.connected_account_id === igAccountId, "container tool ran on the gateway account");
    const publish = inspect2.composio.actions.filter((a) => a.slug === "INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH").pop();
    assert(publish && publish.connected_account_id === igAccountId, "publish tool ran on the gateway account");
  });
  await test("gateway account is listed, dashboard account is not (user filter)", async () => {
    const list = ok(await api("GET", "/api/composio/connected-accounts", { workspaceId: ws }));
    const items = list.data.data;
    const fresh = items.find((a) => a.id === "ca_new_1");
    assert(fresh && fresh.status === "ACTIVE" && fresh.providerId === "x", "new gateway account active and mapped");
    assert(!items.some((a) => a.alias === "Dashboard X"), "accounts from other composio users are excluded");
  });
  await test("gateway account imports + publishes end-to-end", async () => {
    const imp = ok(await api("POST", "/api/composio/import", {
      body: { composioAccountId: "ca_new_1", providerId: "x", accountName: "Gateway X" },
      workspaceId: ws,
    }));
    const r = ok(await api("POST", "/api/posts", {
      workspaceId: ws,
      body: {
        variants: [{ providerId: "x", text: "Gateway publish" }],
        accountIds: [imp.data.data.accountId],
        publishNow: true,
      },
    }));
    const id = r.data.data.id;
    await waitFor(async () => {
      const p = ok(await api("GET", "/api/posts", { workspaceId: ws }));
      const post = p.data.data.items.find((x) => x.id === id);
      return ["published", "failed"].includes(post?.status) ? post : null;
    }, 40000);
    const inspect = await (await fetch(`${MOCK_URL}/__inspect`)).json();
    const action = inspect.composio.actions.filter((a) => a.slug === "TWITTER_CREATION_OF_A_POST").pop();
    assert(action && action.connected_account_id === "ca_new_1", "publish ran through the gateway account");
  });
  await test("gateway guards: unsupported platform and missing key", async () => {
    const unsupported = await api("POST", "/api/composio/connect", { body: { providerId: "bluesky" }, workspaceId: ws });
    assert(unsupported.status === 400, `expected 400 for unsupported platform, got ${unsupported.status}`);
    // Missing key: a workspace with no composio key configured (second user's fresh workspace).
    cookie = ""; // start without a session
    ok(await api("POST", "/api/auth/register", { body: { email: `gw${Date.now()}@e2e.dev`, name: "GW", password: "password123" } }));
    const me2 = ok(await api("GET", "/api/auth/me"));
    const ws2 = me2.data.data.workspaces[0].id;
    const noKey = await api("POST", "/api/composio/connect", { body: { providerId: "x" }, workspaceId: ws2 });
    assert(noKey.status === 400, `expected 400 without composio key, got ${noKey.status}`);
    // Restore the original session for the remaining tests.
    cookie = "";
    ok(await api("POST", "/api/auth/login", { body: { email: "e2e@example.com", password: "password123" } }));
  });

  // ---- Quick automation attach (composer) ---------------------------------------
  await test("attach a template while composing instantiates + publishes the automation", async () => {
    const r = ok(await api("POST", "/api/posts", {
      workspaceId: ws,
      body: {
        variants: [{ providerId: "bluesky", text: "Post with attached automation" }],
        accountIds: [accounts.bluesky],
        attachTemplateIds: ["instagram-comment-to-dm"],
      },
    }));
    const postId = r.data.data.id;
    const autos = ok(await api("GET", "/api/automations", { workspaceId: ws }));
    const attached = autos.data.data.find(
      (a) => a.name.startsWith("Instagram comment-to-DM") && a.status === "published",
    );
    assert(!!attached, "automation created and published from template");
    const links = await (async () => {
      const out = runSync("npx", ["wrangler", "d1", "execute", "postflare-db", "--local", "--json", "--command",
        `SELECT automation_id FROM post_automations WHERE post_id = '${postId}'`]);
      return JSON.parse(out)[0].results.map((row) => row.automation_id);
    })();
    assert(links.includes(attached.id), "automation linked to the post");
  });

  // ---- Data retention ------------------------------------------------------------
  await test("data retention settings are enforced by the cron sweep", async () => {
    // Seed an audit row far in the past, configure retention, run the sweep.
    runSync("npx", ["wrangler", "d1", "execute", "postflare-db", "--local", "--command",
      `INSERT INTO audit_logs (id, workspace_id, actor_id, action, resource_type, resource_id, metadata_json, created_at) VALUES ('audit_old', '${ws}', NULL, 'old.event', 'test', NULL, '{}', '2020-01-01T00:00:00.000Z')`]);
    ok(await api("PATCH", "/api/settings", { body: { settings: { retentionDays: 90 } }, workspaceId: ws }));
    const sweepRes = await rawFetch("/cdn-cgi/local/scheduled?worker=postflare", { method: "POST" });
    assert(sweepRes.status === 200, "sweep ran");
    const check = JSON.parse(runSync("npx", ["wrangler", "d1", "execute", "postflare-db", "--local", "--json", "--command",
      `SELECT COUNT(*) AS n FROM audit_logs WHERE id = 'audit_old'`]));
    assert(Number(check[0].results[0].n) === 0, "old audit row purged by retention policy");
    // Restore settings so later sweeps keep everything.
    ok(await api("PATCH", "/api/settings", { body: { settings: { retentionDays: 0 } }, workspaceId: ws }));
  });
}

main();