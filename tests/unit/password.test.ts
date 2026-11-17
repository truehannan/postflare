import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "../../worker/utils/crypto";

describe("password hashing (PBKDF2-SHA256)", () => {
  it("hashes and verifies a password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash.algorithm).toBe("PBKDF2-SHA256");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("password-a");
    expect(await verifyPassword("password-b", hash)).toBe(false);
  });

  it("is salted (two hashes differ)", async () => {
    const a = await hashPassword("same-password");
    const b = await hashPassword("same-password");
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });
});