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
    counters = { bluesky: 0, mastodon: 0, telegram: 0, wordpress: 0 };
    return json(res, 200, { ok: true });
  }

  if (path.startsWith("/bluesky/")) return handleBluesky(req, res, path, body);
  if (path.startsWith("/mastodon/")) return handleMastodon(req, res, path, body);
  if (path.startsWith("/telegram/")) return handleTelegram(req, res, path, body);
  if (path.startsWith("/wordpress/")) return handleWordpress(req, res, path, body);
  if (path.startsWith("/webhook")) {
    state.webhook.push(body);
    return json(res, 200, { ok: true });
  }

  return json(res, 404, { error: "unknown mock route" });
});

server.listen(PORT, () => console.log(`mock-provider listening on http://localhost:${PORT}`));