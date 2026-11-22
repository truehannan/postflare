/**
 * Postflare — mock social-provider server for end-to-end testing.
 *
 * Simulates the APIs of the fully-implemented adapters (Bluesky, Mastodon,
 * Telegram, WordPress) plus a generic webhook receiver, all with in-memory
 * state and an inspection endpoint so the e2e runner can assert that real
 * publishes happened.
 *
 *   node scripts/mock-provider.mjs [port]
 */
import { createServer } from "node:http";

const PORT = Number(process.argv[2] ?? process.env.MOCK_PORT ?? 4000);

const state = {
  bluesky: { posts: [] },
  mastodon: { posts: [] },
  telegram: { messages: [] },
  wordpress: { posts: [] },
  webhook: [],
  composio: { actions: [], authConfigCreations: [] },
};

let counters = { bluesky: 0, mastodon: 0, telegram: 0, wordpress: 0 };

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(data) });
  res.end(data);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  const ct = req.headers["content-type"] ?? "";
  if (ct.includes("application/json")) {
    try { return JSON.parse(raw); } catch { return { raw }; }
  }
  return { raw };
}

function handleBluesky(req, res, path, body) {
  if (req.method === "POST" && path.endsWith("/com.atproto.server.createSession")) {
    if (!body.identifier || !body.password) return json(res, 400, { error: "Invalid identifier or password" });
    return json(res, 200, { accessJwt: "mock-jwt", did: "did:plc:mock", handle: "mock.bsky.social" });
  }
  if (req.method === "GET" && path.includes("/app.bsky.actor.getProfile")) {
    return json(res, 200, { displayName: "Mock Bluesky", handle: "mock.bsky.social" });
  }
  if (req.method === "POST" && path.endsWith("/com.atproto.repo.uploadBlob")) {
    return json(res, 200, { blob: { $type: "blob", ref: { $link: `bafk-mock-${++counters.bluesky}` } } });
  }
  if (req.method === "POST" && path.endsWith("/com.atproto.repo.createRecord")) {
    counters.bluesky += 1;
    state.bluesky.posts.push({ text: body.record?.text, embed: body.record?.embed ?? null });
    return json(res, 200, { uri: `at://did:plc:mock/app.bsky.feed.post/${counters.bluesky}`, cid: "mockcid" });
  }
  if (req.method === "POST" && path.endsWith("/com.atproto.repo.deleteRecord")) {
    return json(res, 200, {});
  }
  return json(res, 404, { error: `unknown bluesky route ${req.method} ${path}` });
}

function handleMastodon(req, res, path, body) {
  if (req.method === "GET" && path.endsWith("/api/v1/accounts/verify_credentials")) {
    return json(res, 200, { id: "1", username: "mockuser", display_name: "Mock Mastodon", avatar: "" });
  }
  if (req.method === "POST" && path.endsWith("/api/v2/media")) {
    return json(res, 200, { id: `media_${++counters.mastodon}` });
  }
  if (req.method === "POST" && path.endsWith("/api/v1/statuses")) {
    counters.mastodon += 1;
    state.mastodon.posts.push({ status: body.status, media_ids: body.media_ids ?? [] });
    return json(res, 200, { id: String(counters.mastodon), uri: `https://mastodon.mock/@mockuser/${counters.mastodon}` });
  }
  if (req.method === "DELETE" && path.includes("/api/v1/statuses/")) {
    return json(res, 200, {});
  }
  return json(res, 404, { error: `unknown mastodon route ${req.method} ${path}` });
}

function handleTelegram(req, res, path, body) {
  if (req.method === "POST" && path.endsWith("/getMe")) {
    return json(res, 200, { ok: true, result: { id: 123456, username: "mockbot", first_name: "Mock Bot" } });
  }
  if (req.method === "POST" && path.endsWith("/sendMessage")) {
    counters.telegram += 1;
    state.telegram.messages.push({ chat_id: body.chat_id, text: body.text });
    return json(res, 200, { ok: true, result: { message_id: counters.telegram } });
  }
  return json(res, 404, { ok: false, description: `unknown telegram route ${req.method} ${path}` });
}

function handleWordpress(req, res, path, body) {
  if (req.method === "GET" && path.endsWith("/wp-json/wp/v2/users/me")) {
    return json(res, 200, { id: 1, name: "Mock WP", slug: "mock-wp" });
  }
  if (req.method === "POST" && path.endsWith("/wp-json/wp/v2/posts")) {
    counters.wordpress += 1;
    state.wordpress.posts.push({ title: body.title, content: body.content });
    return json(res, 201, { id: counters.wordpress });
  }
  if (req.method === "DELETE" && path.includes("/wp-json/wp/v2/posts/")) {
    return json(res, 200, {});
  }
  return json(res, 404, { error: `unknown wordpress route ${req.method} ${path}` });
}

const COMPOSIO_ACCOUNTS = [
  { id: "ca_twitter_1", toolkit: { slug: "TWITTER" }, status: "ACTIVE", alias: "Mock X", word_id: null, user_id: "postflare" },
  { id: "ca_linkedin_1", toolkit: { slug: "LINKEDIN" }, status: "ACTIVE", alias: "Mock LinkedIn", word_id: null, user_id: "postflare" },
  { id: "ca_instagram_1", toolkit: { slug: "INSTAGRAM" }, status: "ACTIVE", alias: "Mock IG", word_id: null, user_id: "postflare" },
  { id: "ca_telegram_1", toolkit: { slug: "TELEGRAM" }, status: "ACTIVE", alias: "Mock Tg", word_id: null, user_id: "postflare" },
  { id: "ca_facebook_1", toolkit: { slug: "FACEBOOK" }, status: "ACTIVE", alias: "Mock FB Page", word_id: null, user_id: "postflare" },
  { id: "ca_threads_1", toolkit: { slug: "THREADS" }, status: "ACTIVE", alias: "Mock Threads", word_id: null, user_id: "postflare" },
  { id: "ca_reddit_1", toolkit: { slug: "REDDIT" }, status: "ACTIVE", alias: "Mock Reddit", word_id: null, user_id: "postflare" },
  { id: "ca_github_1", toolkit: { slug: "GITHUB" }, status: "ACTIVE", alias: "Mock GitHub", word_id: null, user_id: "postflare" }, // unsupported in Postflare
  // A connection created elsewhere (different user) — must NOT be listed
  // when Postflare filters by its own user, "postflare".
  { id: "ca_dash_1", toolkit: { slug: "TWITTER" }, status: "ACTIVE", alias: "Dashboard X", word_id: null, user_id: "someone_else" },
];

// Auth configs per toolkit (id → toolkit), as Composio's managed defaults.
const COMPOSIO_AUTH_CONFIGS = {
  TWITTER: "ac_twitter",
  INSTAGRAM: "ac_instagram",
  FACEBOOK: "ac_facebook",
  LINKEDIN: "ac_linkedin",
  THREADS: "ac_threads",
  REDDIT: "ac_reddit",
  TELEGRAM: "ac_telegram",
};

// Mutable auth-config registry. INSTAGRAM starts WITHOUT a config so the
// auto-enable path (POST /auth_configs with use_composio_managed_auth) is
// exercised by the e2e suite — mirroring a fresh Composio project.
const authConfigs = {};
for (const [slug, id] of Object.entries(COMPOSIO_AUTH_CONFIGS)) {
  if (slug !== "INSTAGRAM") {
    authConfigs[slug] = {
      id,
      name: `${slug} managed`,
      type: "default",
      toolkit: { slug },
      auth_scheme: "OAUTH2",
      is_composio_managed: true,
      status: "ENABLED",
      no_of_connections: 0,
    };
  }
}
let authConfigCounter = 0;

// Accounts created through the link flow (the auth gateway).
const dynamicAccounts = [];
let dynamicCounter = 0;

function allComposioAccounts() {
  return [...COMPOSIO_ACCOUNTS, ...dynamicAccounts];
}

function filterComposioAccounts(url) {
  let accounts = allComposioAccounts();
  const ids = url.searchParams.get("connected_account_ids");
  if (ids) {
    const wanted = ids.split(",");
    accounts = accounts.filter((a) => wanted.includes(a.id));
  }
  const userIds = url.searchParams.get("user_ids");
  if (userIds) {
    const wanted = userIds.split(",");
    accounts = accounts.filter((a) => wanted.includes(a.user_id));
  }
  return accounts;
}

function handleComposio(req, res, path, body, url) {
  // Auth-config listing: used to resolve the toolkit's enabled config.
  if (req.method === "GET" && path === "/auth_configs") {
    const slugs = (url.searchParams.get("toolkit_slug") ?? "").split(",").filter(Boolean);
    const showDisabled = url.searchParams.get("show_disabled") === "true";
    let items = Object.values(authConfigs);
    if (slugs.length) items = items.filter((c) => slugs.includes(c.toolkit.slug));
    if (!showDisabled) items = items.filter((c) => c.status === "ENABLED");
    return json(res, 200, { items, next_cursor: null, total_items: items.length, current_page: 1, total_pages: 1 });
  }

  // Auth-config creation: the auto-enable path Postflare uses so users never
  // touch the Composio dashboard (Composio-managed auth only).
  if (req.method === "POST" && path === "/auth_configs") {
    const slug = body?.toolkit?.slug;
    const type = body?.auth_config?.type;
    if (!slug || !COMPOSIO_AUTH_CONFIGS[slug]) {
      return json(res, 400, { error: { message: "Unknown toolkit slug", code: 400, slug: "bad_request", status: 400 } });
    }
    if (type !== "use_composio_managed_auth") {
      return json(res, 400, { error: { message: "Mock only supports use_composio_managed_auth", code: 400, slug: "bad_request", status: 400 } });
    }
    state.composio.authConfigCreations.push({ slug, type });
    authConfigCounter += 1;
    const created = {
      id: `ac_${slug.toLowerCase()}_managed_${authConfigCounter}`,
      name: `${slug} managed (auto-enabled)`,
      type: "default",
      toolkit: { slug },
      auth_scheme: "OAUTH2",
      is_composio_managed: true,
      status: "ENABLED",
      no_of_connections: 0,
    };
    authConfigs[slug] = created;
    return json(res, 201, { toolkit: { slug }, auth_config: created });
  }

  // The auth gateway link: creates a pending account under the given user and
  // returns Composio's hosted authorization URL.
  if (req.method === "POST" && path === "/connected_accounts/link") {
    const toolkitSlug = Object.values(authConfigs).find(
      (c) => c.id === body.auth_config_id,
    )?.toolkit?.slug;
    if (!toolkitSlug) {
      return json(res, 400, { error: { message: "Unknown auth config id", code: 400, slug: "bad_request", status: 400 } });
    }
    dynamicCounter += 1;
    const id = `ca_new_${dynamicCounter}`;
    dynamicAccounts.push({
      id,
      toolkit: { slug: toolkitSlug },
      status: "INITIALIZING",
      alias: `New ${toolkitSlug} ${dynamicCounter}`,
      word_id: null,
      user_id: body.user_id ?? "postflare",
      callback_url: body.callback_url ?? null,
    });
    return json(res, 201, {
      link_token: `lt_${id}`,
      redirect_url: `http://localhost:${PORT}/composio/api/v3.1/auth/complete?account_id=${id}`,
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      connected_account_id: id,
    });
  }

  // Simulated completion of Composio's hosted OAuth: flips the account ACTIVE
  // and redirects the browser back to the app's callback URL.
  if (req.method === "GET" && path === "/auth/complete") {
    const id = url.searchParams.get("account_id");
    const account = dynamicAccounts.find((a) => a.id === id);
    if (!account) return json(res, 404, { error: { message: "Unknown pending account", code: 404, slug: "not_found", status: 404 } });
    account.status = "ACTIVE";
    res.writeHead(302, { location: account.callback_url ?? "/" });
    return res.end();
  }

  if (path === "/connected_accounts") {
    const items = filterComposioAccounts(url);
    return json(res, 200, { items, next_cursor: null, total_items: items.length, current_page: 1, total_pages: 1 });
  }
  const toolMatch = path.match(/^\/tools\/execute\/([A-Z0-9_]+)$/);
  if (req.method === "POST" && toolMatch) {
    const slug = toolMatch[1];
    const args = body.arguments ?? {};
    state.composio.actions.push({ slug, args, connected_account_id: body.connected_account_id });
    if (slug === "LINKEDIN_GET_MY_INFO") {
      return json(res, 200, { data: JSON.stringify({ id: "mock-li-user", name: "Mock LinkedIn" }), error: null, successful: true });
    }
    if (slug === "INSTAGRAM_POST_IG_USER_MEDIA") {
      return json(res, 200, { data: JSON.stringify({ id: "17890000000000001" }), error: null, successful: true });
    }
    return json(res, 200, { data: JSON.stringify({ id: `mock-post-${state.composio.actions.length}` }), error: null, successful: true });
  }
  return json(res, 404, { error: { message: `unknown composio route ${req.method} ${path}` } });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  const body = await readBody(req);

  if (path === "/health") return json(res, 200, { ok: true });
  if (path === "/__inspect") return json(res, 200, state);
  if (path === "/__reset") {
    state.bluesky.posts.length = 0;
    state.mastodon.posts.length = 0;
    state.telegram.messages.length = 0;
    state.wordpress.posts.length = 0;
    state.webhook.length = 0;
    state.composio.actions.length = 0;
    state.composio.authConfigCreations.length = 0;
    dynamicAccounts.length = 0;
    // Restore the registry: everything enabled except INSTAGRAM (auto-enable case).
    for (const key of Object.keys(authConfigs)) delete authConfigs[key];
    for (const [slug, id] of Object.entries(COMPOSIO_AUTH_CONFIGS)) {
      if (slug !== "INSTAGRAM") {
        authConfigs[slug] = {
          id,
          name: `${slug} managed`,
          type: "default",
          toolkit: { slug },
          auth_scheme: "OAUTH2",
          is_composio_managed: true,
          status: "ENABLED",
          no_of_connections: 0,
        };
      }
    }
    authConfigCounter = 0;
    dynamicCounter = 0;
    counters = { bluesky: 0, mastodon: 0, telegram: 0, wordpress: 0 };
    return json(res, 200, { ok: true });
  }

  if (path.startsWith("/bluesky/")) return handleBluesky(req, res, path, body);
  if (path.startsWith("/mastodon/")) return handleMastodon(req, res, path, body);
  if (path.startsWith("/telegram/")) return handleTelegram(req, res, path, body);
  if (path.startsWith("/wordpress/")) return handleWordpress(req, res, path, body);
  if (path.startsWith("/composio/")) {
    const composioPath = path.replace(/^\/composio\/api\/v3(\.1)?/, "");
    return handleComposio(req, res, composioPath, body, url);
  }
  if (path.startsWith("/webhook")) {
    state.webhook.push(body);
    return json(res, 200, { ok: true });
  }

  return json(res, 404, { error: "unknown mock route" });
});

server.listen(PORT, () => console.log(`mock-provider listening on http://localhost:${PORT}`));