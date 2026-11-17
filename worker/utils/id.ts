/** Compact, collision-resistant identifiers for internal entities. */

const HEX = "0123456789abcdef";

export function randomId(prefix: string, bytes = 12): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  let hex = "";
  for (let i = 0; i < buf.length; i++) {
    hex += HEX[buf[i] >> 4] + HEX[buf[i] & 0xf];
  }
  return `${prefix}_${hex}`;
}

export function uuid(): string {
  return crypto.randomUUID();
}