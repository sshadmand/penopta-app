import { and, eq, isNull } from "drizzle-orm";

import { codeChallengeS256, randomToken } from "@/lib/oauth/pkce";
import { db } from "@/lib/db/client";
import {
  oauthAuthorizationCodes,
  type OAuthAuthorizationCodeRow,
} from "@/lib/db/schema";
import { AUTH_CODE_TTL_MS } from "@/lib/oauth/config";
import { hashToken } from "@/lib/oauth/tokens";

export interface CreateCodeParams {
  clientId: string;
  userId: string;
  redirectUri: string;
  scope: string;
  resource: string | null;
  codeChallenge: string;
  codeChallengeMethod: string;
}

/** Persist a single-use authorization code and return the raw value. */
export async function createAuthorizationCode(
  params: CreateCodeParams,
): Promise<string> {
  const code = `code_${randomToken(32)}`;
  await db.insert(oauthAuthorizationCodes).values({
    codeHash: await hashToken(code),
    clientId: params.clientId,
    userId: params.userId,
    redirectUri: params.redirectUri,
    scope: params.scope,
    resource: params.resource,
    codeChallenge: params.codeChallenge,
    codeChallengeMethod: params.codeChallengeMethod,
    expiresAt: new Date(Date.now() + AUTH_CODE_TTL_MS),
  });
  return code;
}

export type ConsumeResult =
  | {
      ok: true;
      row: OAuthAuthorizationCodeRow;
    }
  | { ok: false; error: string };

/**
 * Redeem an authorization code exactly once. Validates the client, redirect
 * URI, expiry, and the PKCE code verifier, then marks the code consumed.
 */
export async function consumeAuthorizationCode(params: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<ConsumeResult> {
  const hash = await hashToken(params.code);
  const rows = await db
    .select()
    .from(oauthAuthorizationCodes)
    .where(
      and(
        eq(oauthAuthorizationCodes.codeHash, hash),
        isNull(oauthAuthorizationCodes.consumedAt),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return { ok: false, error: "invalid or already-used code" };

  // Mark consumed immediately to prevent replay, even if later checks fail.
  await db
    .update(oauthAuthorizationCodes)
    .set({ consumedAt: new Date() })
    .where(eq(oauthAuthorizationCodes.id, row.id));

  if (row.expiresAt.getTime() <= Date.now()) {
    return { ok: false, error: "code expired" };
  }
  if (row.clientId !== params.clientId) {
    return { ok: false, error: "client mismatch" };
  }
  if (row.redirectUri !== params.redirectUri) {
    return { ok: false, error: "redirect_uri mismatch" };
  }

  if (row.codeChallengeMethod !== "S256") {
    return { ok: false, error: "unsupported code_challenge_method" };
  }
  const expected = await codeChallengeS256(params.codeVerifier);
  if (expected !== row.codeChallenge) {
    return { ok: false, error: "PKCE verification failed" };
  }

  return { ok: true, row };
}
