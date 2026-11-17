import type { SocialPlatformAdapter, AccountProfile, PublishResult } from "./types";
import { redactError } from "./types";

function base(credentials: Record<string, string>): string {
  return `${(credentials.baseUrl ?? "").replace(/\/+$/, "")}/wp-json/wp/v2`;
}

function authHeader(credentials: Record<string, string>): string {
  return `Basic ${btoa(`${credentials.username}:${credentials.appPassword}`)}`;
}

export const wordpressAdapter: SocialPlatformAdapter = {
  providerId: "wordpress",
  displayName: "WordPress",

  async validateCredentials(credentials) {
    try {
      const res = await fetch(`${base(credentials)}/users/me?context=edit`, {
        headers: { authorization: authHeader(credentials) },
      });
      if (res.status !== 200) return { ok: false, message: `HTTP ${res.status} — check site URL, username and application password` };
      const j = (await res.json()) as { name?: string; slug?: string };
      return { ok: true, message: `Connected as ${j.name ?? j.slug}` };
    } catch (e) {
      return { ok: false, message: redactError(e) };
    }
  },

  async getAccountProfile(credentials) {
    const res = await fetch(`${base(credentials)}/users/me?context=edit`, {
      headers: { authorization: authHeader(credentials) },
    });
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    const j = (await res.json()) as { name?: string; slug?: string; avatar_urls?: Record<string, string>; id: number };
    const profile: AccountProfile = {
      accountName: j.name ?? j.slug ?? "WordPress site",
      username: j.slug ?? String(j.id),
      avatarUrl: j.avatar_urls?.["96"],
      externalId: String(j.id),
    };
    return profile;
  },

  async publishPost(credentials, input) {
    try {
      const res = await fetch(`${base(credentials)}/posts`, {
        method: "POST",
        headers: {
          authorization: authHeader(credentials),
          "content-type": "application/json",
        },
        body: JSON.stringify({
          title: input.title ?? "",
          content: input.text,
          status: "publish",
          link: input.link,
        }),
      });
      const j = (await res.json()) as { id?: number; message?: string; data?: { status?: number } };
      if (res.status !== 201 && res.status !== 200) {
        const result: PublishResult = {
          ok: false,
          error: redactError(j.message ?? `HTTP ${res.status}`),
          errorCode: "publish_failed",
          retryable: res.status >= 500,
        };
        return result;
      }
      return { ok: true, remoteId: String(j.id), responseSummary: "post:created" };
    } catch (e) {
      return { ok: false, error: redactError(e), errorCode: "publish_error", retryable: true };
    }
  },

  async deletePost(credentials, remoteId) {
    const res = await fetch(`${base(credentials)}/posts/${remoteId}`, {
      method: "DELETE",
      headers: { authorization: authHeader(credentials) },
    });
    if (res.status !== 200) return { ok: false, error: `HTTP ${res.status}`, errorCode: "delete_failed", retryable: res.status >= 500 };
    return { ok: true, responseSummary: "post:deleted" };
  },
};