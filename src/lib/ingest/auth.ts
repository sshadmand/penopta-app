import { getSession } from "@/lib/auth/server";
import {
  HostTokenExpiredError,
  resolveOwnerByHostToken,
  type HostTokenOwner,
} from "@/lib/host-sync/tokens";
import { resolveOwnerByApiKey, type ApiKeyOwner } from "@/lib/keys/data";
import { verifyAccessToken } from "@/lib/oauth/tokens";
import { resolveActiveOrg } from "@/lib/orgs/data";

/** Extract the Bearer token from an Authorization header value. */
export function parseBearerToken(
  authorization: string | null,
): string | null {
  if (!authorization) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  const token = match?.[1]?.trim();
  return token || null;
}

export type IngestOwner = ApiKeyOwner & { hostTokenId?: string };

/**
 * Resolve the owner + org from `Authorization: Bearer <token>`.
 *
 * Accepts:
 * - OAuth access tokens (`pat_…`) from the same flow MCP clients use
 * - User API keys (`pk_…`) for headless/agent clients
 * - Host sync tokens (`hst_…`) for Linux host sync (agent-sync only)
 *
 * Returns null when missing/invalid/revoked. Expired host tokens throw
 * `HostTokenExpiredError`.
 */
export async function resolveOwnerFromBearer(
  authorization: string | null,
): Promise<IngestOwner | null> {
  const token = parseBearerToken(authorization);
  if (!token) return null;

  // Prefer OAuth when the token is a live access token.
  const oauth = await verifyAccessToken(token);
  if (oauth) {
    return { ownerUserId: oauth.ownerUserId, orgId: oauth.orgId };
  }

  const apiKey = await resolveOwnerByApiKey(token);
  if (apiKey) return apiKey;

  return resolveOwnerByHostToken(token);
}

/**
 * Resolve the owner + org from the incoming request.
 *
 * Accepts:
 * - `Authorization: Bearer <token>` (OAuth `pat_…`, API key `pk_…`, or host `hst_…`)
 * - Better Auth session cookies (Mac app window sign-in, same as the website)
 */
export async function resolveOwnerFromRequest(
  authorization: string | null,
): Promise<IngestOwner | null> {
  const fromBearer = await resolveOwnerFromBearer(authorization);
  if (fromBearer) return fromBearer;

  const session = await getSession();
  if (!session?.user?.id) return null;
  const { activeOrg } = await resolveActiveOrg(session.user.id);
  return { ownerUserId: session.user.id, orgId: activeOrg.id };
}

export { HostTokenExpiredError };
export type { HostTokenOwner };
