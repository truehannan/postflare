import type { SocialPlatformAdapter, PublishResult } from "./types";
import { redactError } from "./types";

async function hmac(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const webhookAdapter: SocialPlatformAdapter = {
  providerId: "webhook",
  displayName: "Custom webhook",

  async validateCredentials(credentials) {
    const url = credentials.webhookUrl;
    if (!url) return { ok: false, message: "Webhook URL is required" };
    try {
      new URL(url);
      return { ok: true, message: "Webhook URL is valid" };
    } catch {
      return { ok: false, message: "Webhook URL is not a valid URL" };
    }
  },

  async publishPost(credentials, input) {
    try {
      const payload = {
        text: input.text,
        title: input.title ?? null,
        link: input.link ?? null,
        mediaUrls: input.mediaUrls ?? [],
        publishedAt: new Date().toISOString(),
      };
      const body = JSON.stringify(payload);
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (credentials.signingSecret) {
        headers["x-postflare-signature"] = `sha256=${await hmac(credentials.signingSecret, body)}`;
      }
      const res = await fetch(credentials.webhookUrl, { method: "POST", headers, body });
      if (!res.ok) {
        const result: PublishResult = {
          ok: false,
          error: `Webhook responded HTTP ${res.status}`,
          errorCode: "publish_failed",
          retryable: res.status >= 500,
        };
        return result;
      }
      return { ok: true, remoteId: `webhook_${Date.now()}`, responseSummary: "webhook:delivered" };
    } catch (e) {
      return { ok: false, error: redactError(e), errorCode: "publish_error", retryable: true };
    }
  },
};