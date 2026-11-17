import { describe, it, expect } from "vitest";
import {
  buildKeyring,
  encrypt,
  decrypt,
  serializeEnvelope,
  parseEnvelope,
  importAesKey,
} from "../../worker/utils/crypto";
import { randomBase64, base64Decode } from "../../worker/utils/base64";

describe("CredentialVault encryption (AES-256-GCM)", () => {
  it("round-trips plaintext through the versioned envelope", async () => {
    const keyring = await buildKeyring(randomBase64(32));
    const secret = "client_secret_1234567890";
    const envelope = await encrypt(secret, keyring);
    expect(envelope.version).toBe(1);
    expect(envelope.algorithm).toBe("AES-GCM");
    const decrypted = await decrypt(envelope, keyring);
    expect(decrypted).toBe(secret);
  });

  it("uses a unique IV for every encryption", async () => {
    const keyring = await buildKeyring(randomBase64(32));
    const a = await encrypt("same", keyring);
    const b = await encrypt("same", keyring);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("produces 12-byte IVs (96-bit)", async () => {
    const keyring = await buildKeyring(randomBase64(32));
    const envelope = await encrypt("value", keyring);
    expect(base64Decode(envelope.iv)).toHaveLength(12);
  });

  it("fails to decrypt with a different key", async () => {
    const ring1 = await buildKeyring(randomBase64(32));
    const ring2 = await buildKeyring(randomBase64(32));
    const envelope = await encrypt("top secret", ring1);
    await expect(decrypt(envelope, ring2)).rejects.toThrow();
  });

  it("detects tampered ciphertext (authentication tag)", async () => {
    const keyring = await buildKeyring(randomBase64(32));
    const envelope = await encrypt("integrity check", keyring);
    const tampered = { ...envelope, ciphertext: envelope.ciphertext.slice(0, -4) + "AAAA" };
    await expect(decrypt(tampered, keyring)).rejects.toThrow();
  });

  it("rejects an unsupported envelope version", async () => {
    const keyring = await buildKeyring(randomBase64(32));
    const envelope = { version: 999, algorithm: "AES-GCM", keyVersion: 1, iv: "", ciphertext: "" } as never;
    await expect(decrypt(envelope, keyring)).rejects.toThrow("unsupported_encryption_version");
  });

  it("serializes and parses envelopes", async () => {
    const keyring = await buildKeyring(randomBase64(32));
    const envelope = await encrypt("hello", keyring);
    const parsed = parseEnvelope(serializeEnvelope(envelope));
    expect(parsed.iv).toBe(envelope.iv);
    expect(await decrypt(parsed, keyring)).toBe("hello");
  });

  it("requires a 32-byte key", async () => {
    await expect(importAesKey(randomBase64(16))).rejects.toThrow("exactly 32 bytes");
  });
});