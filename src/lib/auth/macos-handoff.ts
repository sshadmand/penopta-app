import { eq } from "drizzle-orm";
import { makeSignature } from "better-auth/crypto";

import { auth } from "@/lib/auth/auth";
import { db } from "@/lib/db/client";
import { verification } from "@/lib/db/schema";
import { randomToken } from "@/lib/oauth/pkce";
import { hashToken } from "@/lib/oauth/tokens";

const IDENTIFIER_PREFIX = "macos-handoff:";
const CODE_PREFIX = "mh_";
const TTL_MS = 60_000;

function identifierForHash(hash: string): string {
  return `${IDENTIFIER_PREFIX}${hash}`;
}

function authSecret(secret: unknown): string {
  if (typeof secret === "string" && secret.length > 0) return secret;
  const fromEnv =
    process.env.BETTER_AUTH_SECRET?.trim() ||
    process.env.SESSION_SECRET?.trim();
  if (fromEnv) return fromEnv;
  throw new Error("Missing Better Auth secret");
}

/** One-time code the Mac app redeems for a WKWebView session cookie. */
export async function createMacosHandoffCode(userId: string): Promise<string> {
  const code = `${CODE_PREFIX}${randomToken(32)}`;
  const hash = await hashToken(code);
  await db.insert(verification).values({
    id: randomToken(16),
    identifier: identifierForHash(hash),
    value: userId,
    expiresAt: new Date(Date.now() + TTL_MS),
  });
  return code;
}

export async function consumeMacosHandoffCode(
  code: string,
): Promise<string | null> {
  const trimmed = code.trim();
  if (!trimmed.startsWith(CODE_PREFIX) || trimmed.length <= CODE_PREFIX.length) {
    return null;
  }
  const hash = await hashToken(trimmed);
  const [row] = await db
    .delete(verification)
    .where(eq(verification.identifier, identifierForHash(hash)))
    .returning({
      value: verification.value,
      expiresAt: verification.expiresAt,
    });
  if (!row?.value) return null;
  if (row.expiresAt.getTime() <= Date.now()) return null;
  return row.value;
}

export type MacosSessionCookie = {
  name: string;
  value: string;
  path: string;
  secure: boolean;
  maxAge: number;
};

/** New Better Auth session + signed cookie the Mac WKWebView can store. */
export async function mintMacosSessionCookie(
  userId: string,
): Promise<MacosSessionCookie | null> {
  const ctx = await auth.$context;
  const user = await ctx.internalAdapter.findUserById(userId);
  if (!user) return null;

  const session = await ctx.internalAdapter.createSession(userId);
  if (!session?.token) return null;

  const cookie = ctx.authCookies.sessionToken;
  const signed = `${session.token}.${await makeSignature(session.token, authSecret(ctx.secret))}`;
  const maxAge = Math.max(
    60,
    Math.floor((session.expiresAt.getTime() - Date.now()) / 1000),
  );

  return {
    name: cookie.name,
    value: signed,
    path: cookie.attributes.path ?? "/",
    secure: Boolean(cookie.attributes.secure),
    maxAge,
  };
}
