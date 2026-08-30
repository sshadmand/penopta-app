import { createHash, randomBytes } from "node:crypto";

/** SHA-256 hex digest. Host secrets and device codes are stored only as hashes. */
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** URL-safe random token. */
export function randomSecret(byteLength = 24): string {
  return randomBytes(byteLength).toString("base64url");
}

const USER_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Human-facing device / claim code, e.g. `ABCD-EFGH`. */
export function randomUserCode(): string {
  const bytes = randomBytes(8);
  let raw = "";
  for (let i = 0; i < 8; i++) {
    raw += USER_CODE_ALPHABET[bytes[i]! % USER_CODE_ALPHABET.length];
  }
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

/** Normalize typed codes (`abcd efgh` → `ABCD-EFGH`). */
export function normalizeUserCode(value: string): string {
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (compact.length !== 8) return value.trim().toUpperCase();
  return `${compact.slice(0, 4)}-${compact.slice(4)}`;
}
