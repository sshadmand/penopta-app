import { and, desc, eq, gt, isNotNull, isNull } from "drizzle-orm";

import { randomToken } from "@/lib/oauth/pkce";
import { db } from "@/lib/db/client";
import { oauthTokens, type OAuthTokenRow } from "@/lib/db/schema";
import { resolveActiveOrg } from "@/lib/orgs/data";
import {
  ACCESS_TOKEN_TTL_MS,
  MCP_SCOPE,
  REFRESH_TOKEN_TTL_MS,
} from "@/lib/oauth/config";

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** SHA-256 → base64url. Tokens are stored only as hashes. */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return toBase64Url(new Uint8Array(digest));
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  scope: string;
}

/** What a valid MCP access token resolves to. */
export interface McpTokenOwner {
  ownerUserId: string;
  orgId: string;
  clientId: string;
  scope: string;
}

/**
 * Mint an access + refresh token pair for a user/client and persist their
 * hashes. The caller supplies the granted scope and (optional) resource.
 */
export async function issueTokens(params: {
  clientId: string;
  userId: string;
  scope?: string;
  resource?: string | null;
}): Promise<IssuedTokens> {
  const accessToken = `pat_${randomToken(32)}`;
  const refreshToken = `prt_${randomToken(32)}`;
  const now = Date.now();
  const scope = params.scope ?? MCP_SCOPE;

  await db.insert(oauthTokens).values({
    accessTokenHash: await hashToken(accessToken),
    refreshTokenHash: await hashToken(refreshToken),
    clientId: params.clientId,
    userId: params.userId,
    scope,
    resource: params.resource ?? null,
    accessTokenExpiresAt: new Date(now + ACCESS_TOKEN_TTL_MS),
    refreshTokenExpiresAt: new Date(now + REFRESH_TOKEN_TTL_MS),
  });

  return {
    accessToken,
    refreshToken,
    expiresInSeconds: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
    scope,
  };
}

/**
 * Rotate a refresh token: validate it, revoke the old row, and issue a fresh
 * pair. Returns null when the refresh token is unknown/expired/revoked.
 */
export async function rotateRefreshToken(
  refreshToken: string,
  clientId: string,
): Promise<IssuedTokens | null> {
  const hash = await hashToken(refreshToken);
  const rows = await db
    .select()
    .from(oauthTokens)
    .where(
      and(
        eq(oauthTokens.refreshTokenHash, hash),
        eq(oauthTokens.clientId, clientId),
        isNull(oauthTokens.revokedAt),
        gt(oauthTokens.refreshTokenExpiresAt, new Date()),
      ),
    )
    .limit(1);

  const existing = rows[0];
  if (!existing) return null;

  await db
    .update(oauthTokens)
    .set({ revokedAt: new Date() })
    .where(eq(oauthTokens.id, existing.id));

  return issueTokens({
    clientId: existing.clientId,
    userId: existing.userId,
    scope: existing.scope,
    resource: existing.resource,
  });
}

/**
 * Stamp a token as verified: records when `penopta_verify` was last called on
 * this connection and which agent ran it. Keyed by the access token hash so no
 * extra table is needed — the connection row itself carries the proof.
 */
export async function markTokenVerified(
  accessTokenHash: string,
  agent: string | null,
): Promise<void> {
  await db
    .update(oauthTokens)
    .set({ lastVerifiedAt: new Date(), lastVerifiedAgent: agent })
    .where(eq(oauthTokens.accessTokenHash, accessTokenHash));
}

/**
 * Stamp the user's latest non-revoked OAuth connection as verified (used when
 * the client authenticated with an API key instead of a live access token).
 */
export async function markLatestUserTokenVerified(
  userId: string,
  agent: string | null,
): Promise<boolean> {
  const rows = await db
    .select({ id: oauthTokens.id })
    .from(oauthTokens)
    .where(and(eq(oauthTokens.userId, userId), isNull(oauthTokens.revokedAt)))
    .orderBy(desc(oauthTokens.createdAt))
    .limit(1);

  const row = rows[0];
  if (!row) return false;

  await db
    .update(oauthTokens)
    .set({ lastVerifiedAt: new Date(), lastVerifiedAgent: agent })
    .where(eq(oauthTokens.id, row.id));
  return true;
}

/** The last successful `penopta_verify` call on a user's MCP connection. */
export interface McpVerification {
  verifiedAt: Date;
  agent: string | null;
}

/**
 * Latest MCP verification across a user's connections, or null if they've never
 * run `penopta_verify`. Used to gate connector-dependent UI until we've seen the
 * MCP server actually reach us.
 */
export async function getLatestMcpVerification(
  userId: string,
): Promise<McpVerification | null> {
  const rows = await db
    .select({
      verifiedAt: oauthTokens.lastVerifiedAt,
      agent: oauthTokens.lastVerifiedAgent,
    })
    .from(oauthTokens)
    .where(
      and(
        eq(oauthTokens.userId, userId),
        isNotNull(oauthTokens.lastVerifiedAt),
      ),
    )
    .orderBy(desc(oauthTokens.lastVerifiedAt))
    .limit(1);

  const row = rows[0];
  if (!row?.verifiedAt) return null;
  return { verifiedAt: row.verifiedAt, agent: row.agent };
}

/**
 * Verify a bearer access token and resolve it to its owner + active org.
 * Returns null for unknown/expired/revoked tokens.
 */
export async function verifyAccessToken(
  token: string,
): Promise<McpTokenOwner | null> {
  const trimmed = token.trim();
  if (!trimmed) return null;

  const hash = await hashToken(trimmed);
  const rows = await db
    .select()
    .from(oauthTokens)
    .where(
      and(
        eq(oauthTokens.accessTokenHash, hash),
        isNull(oauthTokens.revokedAt),
        gt(oauthTokens.accessTokenExpiresAt, new Date()),
      ),
    )
    .limit(1);

  const row: OAuthTokenRow | undefined = rows[0];
  if (!row) return null;

  const { activeOrg } = await resolveActiveOrg(row.userId);
  return {
    ownerUserId: row.userId,
    orgId: activeOrg.id,
    clientId: row.clientId,
    scope: row.scope,
  };
}
