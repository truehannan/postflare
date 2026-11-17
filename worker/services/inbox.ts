import type { Env } from "../env";
import { getAdapter } from "../adapters/registry";
import { getCredentials } from "./credentials";
import { randomId } from "../utils/id";
import { badRequest, notFound } from "../utils/http";
import type { Conversation, Message, ConversationStatus } from "../../shared/types";

function mapConversation(row: Record<string, unknown>): Conversation {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    accountId: row.account_id as string | null,
    providerId: row.provider_id as string,
    contactId: row.contact_id as string | null,
    status: row.status as ConversationStatus,
    unreadCount: row.unread_count as number,
    assignedTo: row.assigned_to as string | null,
    labels: JSON.parse((row.labels_json as string) ?? "[]"),
    priority: row.priority as Conversation["priority"],
    lastMessagePreview: row.last_message_preview as string | null,
    lastMessageAt: row.last_message_at as string | null,
    createdAt: row.created_at as string,
  };
}

export async function listConversations(
  env: Env,
  workspaceId: string,
  opts: { limit: number; cursor: string | null; status?: string; assignee?: "me" | "unassigned"; search?: string },
): Promise<{ items: Conversation[]; nextCursor: string | null }> {
  const conditions = ["workspace_id = ?"];
  const params: unknown[] = [workspaceId];
  if (opts.status && opts.status !== "all") {
    conditions.push("status = ?");
    params.push(opts.status);
  }
  if (opts.assignee === "unassigned") conditions.push("assigned_to IS NULL");
  if (opts.search) {
    conditions.push("last_message_preview LIKE ?");
    params.push(`%${opts.search}%`);
  }
  const where = conditions.join(" AND ");
  const rows = await env.DB.prepare(
    `SELECT * FROM conversations WHERE ${where} ORDER BY COALESCE(last_message_at, created_at) DESC LIMIT ${opts.limit + 1}`,
  ).bind(...params).all<Record<string, unknown>>();
  const results = rows.results ?? [];
  const hasMore = results.length > opts.limit;
  const page = hasMore ? results.slice(0, opts.limit) : results;
  return { items: page.map(mapConversation), nextCursor: hasMore ? page[page.length - 1].id as string : null };
}

export async function getConversation(env: Env, workspaceId: string, conversationId: string): Promise<Conversation> {
  const row = await env.DB.prepare("SELECT * FROM conversations WHERE id = ? AND workspace_id = ?")
    .bind(conversationId, workspaceId).first<Record<string, unknown>>();
  if (!row) throw notFound("Conversation not found");
  return mapConversation(row);
}

export async function listMessages(env: Env, workspaceId: string, conversationId: string): Promise<Message[]> {
  await getConversation(env, workspaceId, conversationId);
  const rows = await env.DB.prepare(
    "SELECT * FROM messages WHERE conversation_id = ? ORDER BY sent_at ASC",
  ).bind(conversationId).all<Record<string, unknown>>();
  return (rows.results ?? []).map((r) => ({
    id: r.id as string,
    conversationId: r.conversation_id as string,
    direction: r.direction as Message["direction"],
    body: r.body as string | null,
    mediaUrl: r.media_url as string | null,
    sentAt: r.sent_at as string,
    senderName: r.sender_name as string | null,
  }));
}

export async function sendReply(
  env: Env,
  workspaceId: string,
  conversationId: string,
  text: string,
): Promise<{ ok: boolean; message: string; providerId: string }> {
  const conv = await getConversation(env, workspaceId, conversationId);
  const now = new Date().toISOString();

  // Store the outbound message first.
  const msgId = randomId("msg");
  await env.DB.prepare(
    "INSERT INTO messages (id, conversation_id, direction, body, sender_name, sent_at, created_at) VALUES (?, ?, 'outbound', ?, ?, ?, ?)",
  ).bind(msgId, conversationId, text, "You", now, now).run();
  await env.DB.prepare(
    "UPDATE conversations SET last_message_preview = ?, last_message_at = ?, updated_at = ? WHERE id = ?",
  ).bind(text.slice(0, 200), now, now, conversationId).run();

  // Attempt a real provider send if supported.
  let ok = false;
  let message = "Reply stored";
  if (conv.accountId) {
    const accountRow = await env.DB.prepare("SELECT provider_id, workspace_id FROM connected_accounts WHERE id = ?")
      .bind(conv.accountId).first<{ provider_id: string; workspace_id: string }>();
    if (accountRow) {
      const adapter = getAdapter(accountRow.provider_id);
      const credentials = (await getCredentials(env, workspaceId, accountRow.provider_id)) ?? {};
      if (adapter.sendMessage) {
        const extRow = await env.DB.prepare("SELECT external_id FROM conversations WHERE id = ?")
          .bind(conversationId).first<{ external_id: string | null }>();
        const recipientId = extRow?.external_id ?? conversationId;
        const res = await adapter.sendMessage(credentials, recipientId, text);
        ok = res.ok;
        message = res.ok ? "Reply sent" : `Provider error: ${res.error}`;
      } else {
        message = "This channel does not support outbound replies";
      }
    }
  }
  return { ok, message, providerId: conv.providerId };
}

export async function markRead(env: Env, workspaceId: string, conversationId: string, read: boolean): Promise<void> {
  await getConversation(env, workspaceId, conversationId);
  await env.DB.prepare("UPDATE conversations SET unread_count = 0, updated_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), conversationId).run();
  void read;
}

export async function assignConversation(env: Env, workspaceId: string, conversationId: string, userId: string | null, actorId: string): Promise<void> {
  await getConversation(env, workspaceId, conversationId);
  await env.DB.prepare("UPDATE conversations SET assigned_to = ?, updated_at = ? WHERE id = ?")
    .bind(userId, new Date().toISOString(), conversationId).run();
  await env.DB.prepare(
    "INSERT INTO conversation_assignments (id, conversation_id, user_id, assigned_by, created_at) VALUES (?, ?, ?, ?, ?)",
  ).bind(randomId("ca"), conversationId, userId ?? "", actorId, new Date().toISOString()).run();
}

export async function addNote(env: Env, workspaceId: string, conversationId: string, body: string, authorId: string): Promise<void> {
  await getConversation(env, workspaceId, conversationId);
  if (!body.trim()) throw badRequest("Note body is required");
  await env.DB.prepare(
    "INSERT INTO internal_notes (id, conversation_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)",
  ).bind(randomId("note"), conversationId, authorId, body.trim(), new Date().toISOString()).run();
}

export async function updateConversationStatus(
  env: Env,
  workspaceId: string,
  conversationId: string,
  status: ConversationStatus,
): Promise<void> {
  await getConversation(env, workspaceId, conversationId);
  await env.DB.prepare("UPDATE conversations SET status = ?, updated_at = ? WHERE id = ?")
    .bind(status, new Date().toISOString(), conversationId).run();
}

export async function listQuickReplies(env: Env, workspaceId: string): Promise<{ id: string; title: string; body: string }[]> {
  const rows = await env.DB.prepare("SELECT id, title, body FROM quick_replies WHERE workspace_id = ? ORDER BY title")
    .bind(workspaceId).all<{ id: string; title: string; body: string }>();
  return rows.results ?? [];
}

export async function createQuickReply(env: Env, workspaceId: string, title: string, body: string): Promise<void> {
  await env.DB.prepare("INSERT INTO quick_replies (id, workspace_id, title, body, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(randomId("qr"), workspaceId, title.trim(), body.trim(), new Date().toISOString()).run();
}

/**
 * Ingest an inbound webhook event: find/create the contact + conversation and
 * append the message. Returns the conversation id.
 */
export async function ingestInbound(
  env: Env,
  input: {
    workspaceId: string;
    providerId: string;
    accountId?: string | null;
    externalConversationId: string;
    externalContactId?: string;
    contactName?: string;
    contactUsername?: string;
    contactAvatar?: string;
    messageBody?: string | null;
    direction?: "inbound" | "outbound";
    receivedAt?: string;
  },
): Promise<{ conversationId: string; contactId: string | null }> {
  const now = input.receivedAt ?? new Date().toISOString();

  let contactId: string | null = null;
  if (input.externalContactId) {
    const profile = await env.DB.prepare(
      "SELECT contact_id FROM contact_profiles WHERE provider_id = ? AND external_id = ?",
    ).bind(input.providerId, input.externalContactId).first<{ contact_id: string }>();
    if (profile) {
      contactId = profile.contact_id;
    } else {
      contactId = randomId("ct");
      await env.DB.prepare(
        "INSERT INTO contacts (id, workspace_id, name, username, avatar_url, consent, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'unknown', ?, ?)",
      ).bind(contactId, input.workspaceId, input.contactName ?? null, input.contactUsername ?? null, input.contactAvatar ?? null, now, now).run();
      await env.DB.prepare(
        "INSERT INTO contact_profiles (id, contact_id, provider_id, external_id, username, avatar_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).bind(randomId("cp"), contactId, input.providerId, input.externalContactId, input.contactUsername ?? null, input.contactAvatar ?? null, now).run();
    }
  }

  let conv = await env.DB.prepare(
    "SELECT id FROM conversations WHERE provider_id = ? AND external_id = ? AND workspace_id = ?",
  ).bind(input.providerId, input.externalConversationId, input.workspaceId).first<{ id: string }>();

  if (!conv) {
    const convId = randomId("conv");
    await env.DB.prepare(
      "INSERT INTO conversations (id, workspace_id, account_id, provider_id, contact_id, external_id, status, unread_count, priority, last_message_preview, last_message_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'open', 1, 'normal', ?, ?, ?, ?)",
    ).bind(convId, input.workspaceId, input.accountId ?? null, input.providerId, contactId, input.externalConversationId, (input.messageBody ?? "").slice(0, 200), now, now, now).run();
    conv = { id: convId };
  } else {
    await env.DB.prepare(
      "UPDATE conversations SET unread_count = unread_count + 1, last_message_preview = ?, last_message_at = ?, updated_at = ? WHERE id = ?",
    ).bind((input.messageBody ?? "").slice(0, 200), now, now, conv.id).run();
  }

  await env.DB.prepare(
    "INSERT INTO messages (id, conversation_id, direction, body, sender_name, external_id, sent_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(randomId("msg"), conv.id, input.direction ?? "inbound", input.messageBody ?? null, input.contactName ?? null, null, now, now).run();

  return { conversationId: conv.id, contactId };
}