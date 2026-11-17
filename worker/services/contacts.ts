import type { Env } from "../env";
import { randomId } from "../utils/id";
import { notFound, badRequest } from "../utils/http";
import { audit } from "./audit";
import type { Contact } from "../../shared/types";

function mapContact(row: Record<string, unknown>, tags: string[] = []): Contact {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    name: row.name as string | null,
    username: row.username as string | null,
    email: row.email as string | null,
    phone: row.phone as string | null,
    avatarUrl: row.avatar_url as string | null,
    tags,
    assignedTo: row.assigned_to as string | null,
    consent: (row.consent as Contact["consent"]) ?? "unknown",
    createdAt: row.created_at as string,
  };
}

export async function listContacts(
  env: Env,
  workspaceId: string,
  opts: { limit: number; cursor: string | null; search?: string; tag?: string },
): Promise<{ items: Contact[]; nextCursor: string | null }> {
  const conditions = ["c.workspace_id = ?", "c.deleted_at IS NULL"];
  const params: unknown[] = [workspaceId];
  if (opts.search) {
    conditions.push("(c.name LIKE ? OR c.email LIKE ? OR c.username LIKE ?)");
    params.push(`%${opts.search}%`, `%${opts.search}%`, `%${opts.search}%`);
  }
  if (opts.tag) {
    conditions.push("c.id IN (SELECT contact_id FROM contact_tag_links WHERE tag_id IN (SELECT id FROM contact_tags WHERE name = ?))");
    params.push(opts.tag);
  }
  const where = conditions.join(" AND ");
  const rows = await env.DB.prepare(
    `SELECT c.*, (SELECT json_group_array(t.name) FROM contact_tag_links l JOIN contact_tags t ON t.id = l.tag_id WHERE l.contact_id = c.id) AS tags
       FROM contacts c WHERE ${where} ORDER BY c.created_at DESC LIMIT ${opts.limit + 1}`,
  ).bind(...params).all<Record<string, unknown>>();

  const results = rows.results ?? [];
  const hasMore = results.length > opts.limit;
  const page = hasMore ? results.slice(0, opts.limit) : results;
  const items = page.map((r) => mapContact(r, r.tags ? (JSON.parse(r.tags as string) as string[]) : []));
  return { items, nextCursor: hasMore ? page[page.length - 1].id as string : null };
}

export async function getContact(env: Env, workspaceId: string, contactId: string): Promise<Contact> {
  const row = await env.DB.prepare(
    `SELECT c.*, (SELECT json_group_array(t.name) FROM contact_tag_links l JOIN contact_tags t ON t.id = l.tag_id WHERE l.contact_id = c.id) AS tags
       FROM contacts c WHERE c.id = ? AND c.workspace_id = ? AND c.deleted_at IS NULL`,
  ).bind(contactId, workspaceId).first<Record<string, unknown>>();
  if (!row) throw notFound("Contact not found");
  return mapContact(row, row.tags ? (JSON.parse(row.tags as string) as string[]) : []);
}

export interface ContactInput {
  name?: string | null;
  username?: string | null;
  email?: string | null;
  phone?: string | null;
  consent?: Contact["consent"];
  assignedTo?: string | null;
}

export async function createContact(env: Env, workspaceId: string, input: ContactInput): Promise<Contact> {
  const id = randomId("ct");
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO contacts (id, workspace_id, name, username, email, phone, consent, assigned_to, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(id, workspaceId, input.name ?? null, input.username ?? null, input.email ?? null, input.phone ?? null, input.consent ?? "unknown", input.assignedTo ?? null, now, now).run();
  return getContact(env, workspaceId, id);
}

export async function updateContact(env: Env, workspaceId: string, contactId: string, input: ContactInput): Promise<Contact> {
  const existing = await env.DB.prepare("SELECT id FROM contacts WHERE id = ? AND workspace_id = ?")
    .bind(contactId, workspaceId).first<{ id: string }>();
  if (!existing) throw notFound("Contact not found");
  const now = new Date().toISOString();
  await env.DB.prepare(
    "UPDATE contacts SET name = ?, username = ?, email = ?, phone = ?, consent = ?, assigned_to = ?, updated_at = ? WHERE id = ?",
  ).bind(input.name ?? null, input.username ?? null, input.email ?? null, input.phone ?? null, input.consent ?? "unknown", input.assignedTo ?? null, now, contactId).run();
  return getContact(env, workspaceId, contactId);
}

export async function deleteContact(env: Env, workspaceId: string, contactId: string, actorId: string): Promise<void> {
  const existing = await env.DB.prepare("SELECT id FROM contacts WHERE id = ? AND workspace_id = ?")
    .bind(contactId, workspaceId).first<{ id: string }>();
  if (!existing) throw notFound("Contact not found");
  await env.DB.prepare("UPDATE contacts SET deleted_at = ? WHERE id = ?").bind(new Date().toISOString(), contactId).run();
  await audit(env, workspaceId, actorId, "contact.delete", "contacts", contactId, {});
}

export async function addTag(env: Env, workspaceId: string, contactId: string, tag: string): Promise<void> {
  await ensureContact(env, workspaceId, contactId);
  let tagRow = await env.DB.prepare("SELECT id FROM contact_tags WHERE workspace_id = ? AND name = ?").bind(workspaceId, tag).first<{ id: string }>();
  if (!tagRow) {
    const tagId = randomId("tag");
    await env.DB.prepare("INSERT INTO contact_tags (id, workspace_id, name) VALUES (?, ?, ?)").bind(tagId, workspaceId, tag).run();
    tagRow = { id: tagId };
  }
  await env.DB.prepare("INSERT OR IGNORE INTO contact_tag_links (id, contact_id, tag_id) VALUES (?, ?, ?)")
    .bind(randomId("ctl"), contactId, tagRow.id).run();
}

export async function removeTag(env: Env, workspaceId: string, contactId: string, tag: string): Promise<void> {
  await env.DB.prepare(
    "DELETE FROM contact_tag_links WHERE contact_id = ? AND tag_id IN (SELECT id FROM contact_tags WHERE workspace_id = ? AND name = ?)",
  ).bind(contactId, workspaceId, tag).run();
}

async function ensureContact(env: Env, workspaceId: string, contactId: string): Promise<void> {
  const existing = await env.DB.prepare("SELECT id FROM contacts WHERE id = ? AND workspace_id = ?").bind(contactId, workspaceId).first();
  if (!existing) throw notFound("Contact not found");
}

export async function exportContactsCsv(env: Env, workspaceId: string): Promise<string> {
  const rows = await env.DB.prepare(
    `SELECT c.name, c.username, c.email, c.phone, c.consent, c.created_at,
            (SELECT group_concat(t.name, ',') FROM contact_tag_links l JOIN contact_tags t ON t.id = l.tag_id WHERE l.contact_id = c.id) AS tags
       FROM contacts c WHERE c.workspace_id = ? AND c.deleted_at IS NULL ORDER BY c.created_at DESC`,
  ).bind(workspaceId).all<Record<string, unknown>>();
  const header = "name,username,email,phone,consent,tags,created_at";
  const lines = (rows.results ?? []).map((r) =>
    [r.name, r.username, r.email, r.phone, r.consent, r.tags, r.created_at]
      .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
      .join(","),
  );
  return [header, ...lines].join("\n");
}

export function importContactsCsv(csv: string): ContactInput[] {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw badRequest("CSV must include a header row and at least one data row");
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const out: ContactInput[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const record: ContactInput = {};
    if (header.includes("name")) record.name = cells[header.indexOf("name")] || null;
    if (header.includes("email")) record.email = cells[header.indexOf("email")] || null;
    if (header.includes("phone")) record.phone = cells[header.indexOf("phone")] || null;
    out.push(record);
  }
  return out;
}