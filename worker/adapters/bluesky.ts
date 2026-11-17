import type { SocialPlatformAdapter, AccountProfile, PublishResult, AdapterCredentials } from "./types";
import { providerFetch, redactError } from "./types";

const DEFAULT_BSKY = "https://bsky.social";

function base(credentials: AdapterCredentials): string {
  return (credentials.apiBaseUrl || DEFAULT_BSKY).replace(/\/+$/, "");
}

async function createSession(credentials: AdapterCredentials, baseUrl: string) {
  const res = await providerFetch(`${baseUrl}/xrpc/com.atproto.server.createSession`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      identifier: credentials.identifier,
      password: credentials.appPassword,
    }),
  });
  if (res.status !== 200 || !res.json) {
    const msg = (res.json as { error?: string; message?: string } | null)?.message ??
      (res.json as { error?: string } | null)?.error ?? `HTTP ${res.status}`;
    return { ok: false as const, message: redactError(msg) };
  }
  const j = res.json as { accessJwt: string; did: string; handle: string };
  return { ok: true as const, accessJwt: j.accessJwt, did: j.did, handle: j.handle };
}

async function uploadBlob(baseUrl: string, jwt: string, bytes: Uint8Array, mimeType: string) {
  const res = await fetch(`${baseUrl}/xrpc/com.atproto.repo.uploadBlob`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${jwt}`,
      "content-type": mimeType,
    },
    body: bytes,
  });
  if (res.status !== 200) throw new Error(`Bluesky media upload failed: HTTP ${res.status}`);
  const j = (await res.json()) as { blob: unknown };
  return j.blob;
}

async function fetchBytes(url: string): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch media: HTTP ${res.status}`);
  const mimeType = res.headers.get("content-type") ?? "application/octet-stream";
  return { bytes: new Uint8Array(await res.arrayBuffer()), mimeType };
}

export const blueskyAdapter: SocialPlatformAdapter = {
  providerId: "bluesky",
  displayName: "Bluesky",

  async validateCredentials(credentials) {
    const s = await createSession(credentials, base(credentials));
    if (!s.ok) return { ok: false, message: s.message };
    return { ok: true, message: `Connected as @${s.handle}` };
  },

  async getAccountProfile(credentials) {
    const baseUrl = base(credentials);
    const s = await createSession(credentials, baseUrl);
    if (!s.ok) throw new Error(s.message);
    const res = await providerFetch(
      `${baseUrl}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(s.did)}`,
      { token: s.accessJwt },
    );
    if (res.status !== 200 || !res.json) throw new Error(`Could not load Bluesky profile: HTTP ${res.status}`);
    const j = res.json as { displayName?: string; handle: string; avatar?: string };
    const profile: AccountProfile = {
      accountName: j.displayName || j.handle,
      username: j.handle,
      avatarUrl: j.avatar,
      externalId: s.did,
    };
    return profile;
  },

  async publishPost(credentials, input) {
    try {
      const baseUrl = base(credentials);
      const s = await createSession(credentials, baseUrl);
      if (!s.ok) return { ok: false, error: s.message, errorCode: "auth_failed", retryable: false };

      const now = new Date().toISOString();
      const altText = typeof input.options?.altText === "string" ? input.options.altText : "";
      let record: Record<string, unknown> = {
        $type: "app.bsky.feed.post",
        text: input.text,
        createdAt: now,
      };

      if (input.mediaUrls && input.mediaUrls.length > 0) {
        const images = [];
        for (const url of input.mediaUrls.slice(0, 4)) {
          const { bytes, mimeType } = await fetchBytes(url);
          images.push({ image: await uploadBlob(baseUrl, s.accessJwt, bytes, mimeType), alt: altText });
        }
        record = {
          ...record,
          embed: { $type: "app.bsky.embed.images", images },
        };
      } else if (input.link) {
        record = {
          ...record,
          embed: {
            $type: "app.bsky.embed.external",
            external: { uri: input.link, title: input.title ?? input.link, description: "" },
          },
        };
      }

      const res = await providerFetch(`${baseUrl}/xrpc/com.atproto.repo.createRecord`, {
        method: "POST",
        token: s.accessJwt,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ repo: s.did, collection: "app.bsky.feed.post", record }),
      });

      if (res.status !== 200 || !res.json) {
        const msg = (res.json as { message?: string } | null)?.message ?? `HTTP ${res.status}`;
        return { ok: false, error: redactError(msg), errorCode: "publish_failed", retryable: res.status >= 500 };
      }
      const j = res.json as { uri: string };
      const result: PublishResult = { ok: true, remoteId: j.uri, responseSummary: "post:created" };
      return result;
    } catch (e) {
      return { ok: false, error: redactError(e), errorCode: "publish_error", retryable: true };
    }
  },

  async deletePost(credentials, remoteId) {
    try {
      const baseUrl = base(credentials);
      const s = await createSession(credentials, baseUrl);
      if (!s.ok) return { ok: false, error: s.message, errorCode: "auth_failed" };
      const res = await providerFetch(`${baseUrl}/xrpc/com.atproto.repo.deleteRecord`, {
        method: "POST",
        token: s.accessJwt,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ repo: s.did, collection: "app.bsky.feed.post", rkey: remoteId.split("/").pop() }),
      });
      if (res.status !== 200) return { ok: false, error: `HTTP ${res.status}`, errorCode: "delete_failed", retryable: res.status >= 500 };
      return { ok: true, responseSummary: "post:deleted" };
    } catch (e) {
      return { ok: false, error: redactError(e), errorCode: "delete_error", retryable: true };
    }
  },
};