/**
 * CredentialVault encryption primitives — AES-256-GCM via Web Crypto only.
 *
 * Every ciphertext is a versioned, authenticated envelope:
 *
 *   { "version": 1, "algorithm": "AES-GCM", "iv": "<b64>", "ciphertext": "<b64>" }
 *
 * A unique 96-bit IV is generated for every encryption operation (never
 * reused with the same key). The authentication tag produced by GCM is
 * verified by `crypto.subtle.decrypt` before any plaintext is returned.
 */

import { base64Decode, base64Encode } from "./base64";

export interface CipherEnvelope {
  version: 1;
  algorithm: "AES-GCM";
  keyVersion: number;
  iv: string;
  ciphertext: string;
}

export interface Keyring {
  /** Currently active key version. */
  active: number;
  /** Map of key version -> CryptoKey. */
  keys: Map<number, CryptoKey>;
}

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();

/** Import a raw base64-encoded 32-byte key as an AES-GCM CryptoKey. */
export async function importAesKey(base64Key: string): Promise<CryptoKey> {
  const raw = base64Decode(base64Key);
  if (raw.byteLength !== 32) {
    throw new Error("ENCRYPTION_KEY must decode to exactly 32 bytes");
  }
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

/**
 * Build a keyring from the primary key and an optional map of legacy keys
 * (version -> base64 key) to support transparent decryption during rotation.
 */
export async function buildKeyring(
  primaryBase64: string,
  legacy: Record<number, string> = {},
): Promise<Keyring> {
  const keys = new Map<number, CryptoKey>();
  for (const [version, key] of Object.entries(legacy)) {
    keys.set(Number(version), await importAesKey(key));
  }
  keys.set(1, await importAesKey(primaryBase64));
  return { active: 1, keys };
}

export async function encryptWithKey(
  plaintext: string,
  key: CryptoKey,
  keyVersion: number,
): Promise<CipherEnvelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    ENCODER.encode(plaintext),
  );
  return {
    version: 1,
    algorithm: "AES-GCM",
    keyVersion,
    iv: base64Encode(iv),
    ciphertext: base64Encode(new Uint8Array(ciphertext)),
  };
}

export async function decryptWithKeyring(
  envelope: CipherEnvelope,
  keyring: Keyring,
): Promise<string> {
  if (envelope.version !== 1 || envelope.algorithm !== "AES-GCM") {
    throw new Error("unsupported_encryption_version");
  }
  const key = keyring.keys.get(envelope.keyVersion);
  if (!key) {
    throw new Error("unknown_encryption_key_version");
  }
  const iv = base64Decode(envelope.iv);
  const ciphertext = base64Decode(envelope.ciphertext);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext,
  );
  return DECODER.decode(plaintext);
}

export function encrypt(plaintext: string, keyring: Keyring): Promise<CipherEnvelope> {
  const key = keyring.keys.get(keyring.active);
  if (!key) throw new Error("keyring_missing_active_key");
  return encryptWithKey(plaintext, key, keyring.active);
}

export function decrypt(envelope: CipherEnvelope, keyring: Keyring): Promise<string> {
  return decryptWithKeyring(envelope, keyring);
}

export function serializeEnvelope(envelope: CipherEnvelope): string {
  return JSON.stringify(envelope);
}

export function parseEnvelope(value: string): CipherEnvelope {
  const parsed = JSON.parse(value) as CipherEnvelope;
  if (parsed.version !== 1 || parsed.algorithm !== "AES-GCM") {
    throw new Error("unsupported_encryption_version");
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Password hashing (PBKDF2-SHA-256 via Web Crypto). See docs/security.md.
// ---------------------------------------------------------------------------

export interface PasswordHash {
  algorithm: "PBKDF2-SHA256";
  iterations: number;
  salt: string;
  hash: string;
}

export async function hashPassword(
  password: string,
  iterations = 120_000,
  salt?: Uint8Array,
): Promise<PasswordHash> {
  const saltBytes = salt ?? crypto.getRandomValues(new Uint8Array(16));
  const material = await crypto.subtle.importKey(
    "raw",
    ENCODER.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBytes, iterations, hash: "SHA-256" },
    material,
    256,
  );
  return {
    algorithm: "PBKDF2-SHA256",
    iterations,
    salt: base64Encode(saltBytes),
    hash: base64Encode(new Uint8Array(bits)),
  };
}

export async function verifyPassword(
  password: string,
  stored: PasswordHash,
): Promise<boolean> {
  const candidate = await hashPassword(password, stored.iterations, base64Decode(stored.salt));
  return timingSafeEqual(candidate.hash, stored.hash);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}