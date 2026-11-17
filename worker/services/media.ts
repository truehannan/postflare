import type { Env } from "../env";
import { randomId } from "../utils/id";
import { badRequest, notFound } from "../utils/http";
import type { MediaAsset } from "../../shared/types";

const MAX_SIZE = 200 * 1024 * 1024; // 200 MB
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/quicktime",
]);

function mapAsset(row: Record<string, unknown>): MediaAsset {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    folderId: row.folder_id as string | null,
    filename: row.filename as string,
    mimeType: row.mime_type as string,
    size: row.size as number,
    width: row.width as number | null,
    height: row.height as number | null,
    duration: row.duration as number | null,
    url: `/media/${row.r2_key as string}`,
    createdAt: row.created_at as string,
  };
}

export interface UploadedFile {
  filename: string;
  mimeType: string;
  data: ArrayBuffer;
}

export async function uploadMedia(
  env: Env,
  workspaceId: string,
  file: UploadedFile,
  folderId?: string | null,
): Promise<MediaAsset> {
  if (!ALLOWED_TYPES.has(file.mimeType)) {
    throw badRequest(`Unsupported media type: ${file.mimeType}`);
  }
  if (file.data.byteLength === 0) throw badRequest("Empty file");
  if (file.data.byteLength > MAX_SIZE) throw badRequest("File exceeds the 200 MB limit");

  const id = randomId("media");
  const r2Key = `${workspaceId}/${id}/${sanitize(file.filename)}`;
  const now = new Date().toISOString();

  await env.MEDIA.put(r2Key, file.data, {
    httpMetadata: { contentType: file.mimeType },
  });

  await env.DB.prepare(
    "INSERT INTO media_assets (id, workspace_id, folder_id, filename, mime_type, size, width, height, duration, r2_key, created_at) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)",
  ).bind(id, workspaceId, folderId ?? null, file.filename, file.mimeType, file.data.byteLength, r2Key, now).run();

  const row = await env.DB.prepare("SELECT * FROM media_assets WHERE id = ?").bind(id).first<Record<string, unknown>>();
  return mapAsset(row!);
}

export async function listMedia(
  env: Env,
  workspaceId: string,
  opts: { limit: number; cursor: string | null; folderId?: string | null; search?: string },
): Promise<{ items: MediaAsset[]; nextCursor: string | null }> {
  const conditions = ["workspace_id = ?", "deleted_at IS NULL"];
  const params: unknown[] = [workspaceId];
  if (opts.folderId) {
    conditions.push("folder_id = ?");
    params.push(opts.folderId);
  }
  if (opts.search) {
    conditions.push("filename LIKE ?");
    params.push(`%${opts.search}%`);
  }
  const where = conditions.join(" AND ");
  const limit = opts.limit + 1;
  const rows = await env.DB.prepare(
    `SELECT * FROM media_assets WHERE ${where} ORDER BY created_at DESC LIMIT ${limit}`,
  ).bind(...params).all<Record<string, unknown>>();

  const results = rows.results ?? [];
  const hasMore = results.length > opts.limit;
  const page = hasMore ? results.slice(0, opts.limit) : results;
  const nextCursor = hasMore ? page[page.length - 1].id as string : null;
  return { items: page.map(mapAsset), nextCursor };
}

export async function getMedia(env: Env, workspaceId: string, mediaId: string): Promise<MediaAsset> {
  const row = await env.DB.prepare("SELECT * FROM media_assets WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL")
    .bind(mediaId, workspaceId).first<Record<string, unknown>>();
  if (!row) throw notFound("Media not found");
  return mapAsset(row);
}

export async function deleteMedia(env: Env, workspaceId: string, mediaId: string): Promise<void> {
  const row = await env.DB.prepare("SELECT id, r2_key FROM media_assets WHERE id = ? AND workspace_id = ?")
    .bind(mediaId, workspaceId).first<{ id: string; r2_key: string }>();
  if (!row) throw notFound("Media not found");

  // Check for live references before removing the object.
  const ref = await env.DB.prepare(
    "SELECT id FROM post_variant_media WHERE media_id = ? LIMIT 1",
  ).bind(mediaId).first();
  if (ref) throw badRequest("This asset is still referenced by a post; remove it from the post first");

  await env.DB.prepare("UPDATE media_assets SET deleted_at = ? WHERE id = ?").bind(new Date().toISOString(), mediaId).run();
  await env.MEDIA.delete(row.r2_key);
}

/** Resolve a stored relative media URL to an absolute URL for providers. */
export function absoluteMediaUrl(env: Env, url: string): string {
  if (/^https?:\/\//.test(url)) return url;
  const base = env.PUBLIC_BASE_URL?.replace(/\/+$/, "");
  if (!base) {
    throw new Error("PUBLIC_BASE_URL is not configured; media cannot be published externally yet");
  }
  return `${base}${url}`;
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-180);
}