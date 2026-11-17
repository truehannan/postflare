import type { SocialPlatformAdapter, AccountProfile, PublishResult } from "./types";
import { redactError } from "./types";

const API = "https://api.telegram.org";

async function call(method: string, token: string, body: Record<string, unknown>) {
  const res = await fetch(`${API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { ok: boolean; result?: unknown; description?: string };
  return { status: res.status, json };
}

export const telegramAdapter: SocialPlatformAdapter = {
  providerId: "telegram",
  displayName: "Telegram",

  async validateCredentials(credentials) {
    const { json } = await call("getMe", credentials.botToken, {});
    if (!json.ok) return { ok: false, message: redactError(json.description ?? "Invalid bot token") };
    const me = json.result as { username?: string; first_name?: string };
    return { ok: true, message: `Connected as @${me.username ?? me.first_name}` };
  },

  async getAccountProfile(credentials) {
    const { json } = await call("getMe", credentials.botToken, {});
    if (!json.ok) throw new Error(redactError(json.description ?? "Invalid bot token"));
    const me = json.result as { username?: string; first_name?: string; id: number };
    const profile: AccountProfile = {
      accountName: me.first_name ?? me.username ?? "Telegram bot",
      username: me.username ?? String(me.id),
      externalId: String(me.id),
    };
    return profile;
  },

  async publishPost(credentials, input) {
    const chatId = credentials.chatId ?? credentials.channelId;
    if (!chatId) {
      return {
        ok: false,
        error: "No chat ID configured. Add a 'chatId' credential (e.g. @yourchannel).",
        errorCode: "missing_chat_id",
        retryable: false,
      };
    }
    const { json, status } = await call("sendMessage", credentials.botToken, {
      chat_id: chatId,
      text: input.text || " ",
    });
    if (!json.ok) {
      const result: PublishResult = {
        ok: false,
        error: redactError(json.description ?? `HTTP ${status}`),
        errorCode: "publish_failed",
        retryable: status >= 500,
      };
      return result;
    }
    const msg = json.result as { message_id: number };
    return { ok: true, remoteId: String(msg.message_id), responseSummary: "message:sent" };
  },

  async sendMessage(credentials, recipientId, text) {
    const { json, status } = await call("sendMessage", credentials.botToken, {
      chat_id: recipientId,
      text,
    });
    if (!json.ok) {
      return { ok: false, error: redactError(json.description ?? `HTTP ${status}`), errorCode: "send_failed", retryable: status >= 500 };
    }
    const msg = json.result as { message_id: number };
    return { ok: true, remoteId: String(msg.message_id), responseSummary: "message:sent" };
  },

  async verifyWebhook(secret, headers, rawBody) {
    // Telegram does not sign webhooks; verification relies on the secret token
    // embedded in the webhook URL (checked by the webhook route).
    void secret;
    void headers;
    void rawBody;
    return true;
  },
};