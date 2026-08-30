import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Encrypt small secrets (BYOK API keys) at rest with AES-256-GCM.
 * Key material comes from `LLM_CREDENTIALS_SECRET`, falling back to
 * `BETTER_AUTH_SECRET` / `SESSION_SECRET` so local setup stays one secret.
 */

function encryptionKey(): Buffer {
  const secret =
    process.env.LLM_CREDENTIALS_SECRET?.trim() ||
    process.env.BETTER_AUTH_SECRET?.trim() ||
    process.env.SESSION_SECRET?.trim();
  if (!secret) {
    throw new Error(
      "Missing LLM_CREDENTIALS_SECRET (or BETTER_AUTH_SECRET) for credential encryption.",
    );
  }
  return createHash("sha256").update(secret).digest();
}

export type EncryptedSecret = {
  ciphertext: string;
  iv: string;
  authTag: string;
};

export function encryptSecret(plain: string): EncryptedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  return {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptSecret(parts: EncryptedSecret): string {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(parts.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(parts.authTag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(parts.ciphertext, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

/** Last 4 printable characters for UI display. */
export function secretLast4(plain: string): string {
  const trimmed = plain.trim();
  if (trimmed.length <= 4) return trimmed;
  return trimmed.slice(-4);
}
