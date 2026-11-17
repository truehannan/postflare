import type { SocialPlatformAdapter, AccountProfile, PublishResult } from "./types";
import { providerFetch, redactError } from "./types";

function base(credentials: Record<string, string>): string {
  const b = (credentials.baseUrl ?? "https://mastodon.social").replace(/\/+$/, "");
  return b;
}

export const mastodonAdapter: SocialPlatformAdapter = {
  providerId: "mastodon",
  displayName: "Mastodon",

  async validateCredentials(credentials) {
    const res = await providerFetch(`${base(credentials)}/api/v1/accounts/verify_credentials`, {
      token: credentials.accessToken,
    });
    if (res.status !== 200 || !res.json) {
      return { ok: false, message: redactError((res.json as { error?: string } | null)?.error ?? `HTTP ${res.status}`) };
    }
    const j = res.json as { username: string; display_name?: string };
    return { ok: true, message: `Connected as @${j.username}` };
  },

  async getAccountProfile(credentials) {
    const res = await providerFetch(`${base(credentials)}/api/v1/accounts/verify_credentials`, {
      token: credentials.accessToken,
    });
    if (res.status !== 200 || !res.json) throw new Error(`Could not load Mastodon profile: HTTP ${res.status}`);
    const j = res.json as { username: string; display_name?: string; avatar?: string; id: string };
    const profile: AccountProfile = {
      accountName: j.display_name || j.username,
      username: j.username,
      avatarUrl: j.avatar,
      externalId: j.id,
    };
    return profile;
  },

  async publishPost(credentials, input) {
    try {
      const mediaIds: string[] = [];
      for (const url of input.mediaUrls ?? []) {
        const fileRes = await fetch(url);
        if (!fileRes.ok) throw new Error(`Could not fetch media: HTTP ${fileRes.status}`);
        const form = new FormData();
        form.append("file", new Blob([await fileRes.arrayBuffer()], { type: fileRes.headers.get("content-type") ?? "application/octet-stream" }), "upload");
        const up = await fetch(`${base(credentials)}/api/v2/media`, {
          method: "POST",
          headers: { authorization: `Bearer ${credentials.accessToken}` },
          body: form,
        });
        if (up.status !== 200 && up.status !== 202) throw new Error(`Media upload failed: HTTP ${up.status}`);
        const upj = (await up.json()) as { id: string };
        mediaIds.push(upj.id);
      }

      const body: Record<string, unknown> = { status: input.text };
      if (mediaIds.length) body.media_ids = mediaIds;

      const res = await providerFetch(`${base(credentials)}/api/v1/statuses`, {
        method: "POST",
        token: credentials.accessToken,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status !== 200 || !res.json) {
        const msg = (res.json as { error?: string } | null)?.error ?? `HTTP ${res.status}`;
        return { ok: false, error: redactError(msg), errorCode: "publish_failed", retryable: res.status >= 500 };
      }
      const j = res.json as { id: string; uri?: string };
      const result: PublishResult = { ok: true, remoteId: j.id, responseSummary: "status:created" };
      return result;
    } catch (e) {
      return { ok: false, error: redactError(e), errorCode: "publish_error", retryable: true };
    }
  },

  async deletePost(credentials, remoteId) {
    const res = await providerFetch(`${base(credentials)}/api/v1/statuses/${remoteId}`, {
      method: "DELETE",
      token: credentials.accessToken,
    });
    if (res.status !== 200) return { ok: false, error: `HTTP ${res.status}`, errorCode: "delete_failed", retryable: res.status >= 500 };
    return { ok: true, responseSummary: "status:deleted" };
  },
};