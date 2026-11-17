import type { Env } from "../env";
import { hashPassword, verifyPassword } from "../utils/crypto";
import { randomBase64, sha256Hex } from "../utils/base64";
import { randomId } from "../utils/id";
import { badRequest, conflict, unauthorized } from "../utils/http";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export const SESSION_COOKIE = "pf_session";

export interface RegisterInput {
  email: string;
  name: string;
  password: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function registerUser(env: Env, input: RegisterInput): Promise<{ token: string; userId: string; workspaceId: string }> {
  const email = normalizeEmail(input.email);
  if (!email.includes("@")) throw badRequest("A valid email address is required");
  if (!input.name.trim()) throw badRequest("Name is required");
  if (input.password.length < 8) throw badRequest("Password must be at least 8 characters");

  const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (existing) throw conflict("An account with this email already exists");

  const now = new Date().toISOString();
  const userId = randomId("usr");
  const passwordHash = JSON.stringify(await hashPassword(input.password));
  const workspaceId = randomId("ws");
  const slug = `${input.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${workspaceId.slice(-6)}`;

  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO users (id, email, name, avatar_url, password_hash, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?, ?)",
    ).bind(userId, email, input.name.trim(), passwordHash, now, now),
    env.DB.prepare(
      "INSERT INTO workspaces (id, name, slug, timezone, plan, created_at, updated_at) VALUES (?, ?, ?, 'UTC', 'free', ?, ?)",
    ).bind(workspaceId, `${input.name.trim()}'s workspace`, slug, now, now),
    env.DB.prepare(
      "INSERT INTO workspace_members (id, workspace_id, user_id, role, created_at) VALUES (?, ?, ?, 'owner', ?)",
    ).bind(randomId("wm"), workspaceId, userId, now),
    env.DB.prepare(
      "INSERT INTO workspace_settings (id, workspace_id, settings_json, updated_at) VALUES (?, ?, '{}', ?)",
    ).bind(randomId("ws_set"), workspaceId, now),
  ]);

  const token = await createSession(env, userId);
  return { token, userId, workspaceId };
}

export async function loginUser(env: Env, email: string, password: string): Promise<string> {
  const row = await env.DB.prepare("SELECT id, password_hash FROM users WHERE email = ?")
    .bind(normalizeEmail(email))
    .first<{ id: string; password_hash: string }>();
  if (!row) throw unauthorized("Invalid email or password");

  let stored: { iterations: number; salt: string; hash: string };
  try {
    stored = JSON.parse(row.password_hash);
  } catch {
    throw unauthorized("Invalid email or password");
  }
  const ok = await verifyPassword(password, { algorithm: "PBKDF2-SHA256", ...stored });
  if (!ok) throw unauthorized("Invalid email or password");

  return createSession(env, row.id);
}

export async function createSession(env: Env, userId: string): Promise<string> {
  const token = randomBase64(32);
  const tokenHash = await sha256Hex(token);
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await env.DB.prepare(
    "INSERT INTO sessions (id, user_id, token_hash, expires_at, last_seen_at, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).bind(randomId("sess"), userId, tokenHash, expiresAt, now, now).run();
  return token;
}

export async function resolveSession(
  env: Env,
  token: string | undefined,
): Promise<{ userId: string; sessionId: string } | null> {
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const now = new Date().toISOString();
  const row = await env.DB.prepare(
    "SELECT id, user_id, expires_at FROM sessions WHERE token_hash = ? AND expires_at > ?",
  ).bind(tokenHash, now).first<{ id: string; user_id: string; expires_at: string }>();
  if (!row) return null;
  return { userId: row.user_id, sessionId: row.id };
}

export async function destroySession(env: Env, token: string | undefined): Promise<void> {
  if (!token) return;
  const tokenHash = await sha256Hex(token);
  await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
}

export function sessionCookie(token: string, secure: boolean): string {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}${secure ? "; Secure" : ""}`;
}

export function clearSessionCookie(secure: boolean): string {
  return `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
}