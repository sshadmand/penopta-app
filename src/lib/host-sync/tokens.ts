import { and, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  hostSyncTokens,
  type HostSyncTokenRow,
} from "@/lib/db/schema";
import { randomSecret, sha256Hex } from "@/lib/host-sync/crypto";
import type { ApiKeyOwner } from "@/lib/keys/data";

export const HOST_TOKEN_PREFIX = "hst_";
export const HOST_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 90; // 90 days
export const HOST_TOKEN_WARN_MS = 1000 * 60 * 60 * 24 * 30; // 30 days before expiry

export class HostTokenExpiredError extends Error {
  constructor() {
    super("host_token_expired");
    this.name = "HostTokenExpiredError";
  }
}

export type HostTokenOwner = ApiKeyOwner & { hostTokenId: string };

function generateSecret(): string {
  return `${HOST_TOKEN_PREFIX}${randomSecret(24)}`;
}

function prefixOf(secret: string): string {
  return `${secret.slice(0, 8)}…`;
}

function isUsable(row: HostSyncTokenRow, now: Date): boolean {
  return row.revokedAt == null && row.expiresAt > now;
}

/**
 * Mint a new host token (or rotate an existing row). Returns the plaintext
 * secret once — it is never stored.
 */
export async function mintHostToken(params: {
  ownerUserId: string;
  orgId: string;
  hostname: string;
  label?: string | null;
  /** When set, overwrite this row instead of inserting. */
  rotateTokenId?: string | null;
}): Promise<{ token: HostSyncTokenRow; secret: string }> {
  const secret = generateSecret();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + HOST_TOKEN_TTL_MS);
  const values = {
    orgId: params.orgId,
    ownerUserId: params.ownerUserId,
    keyHash: sha256Hex(secret),
    keyPrefix: prefixOf(secret),
    hostname: params.hostname.trim() || "linux",
    label: params.label?.trim() || null,
    expiresAt,
    lastUsedAt: null as Date | null,
    revokedAt: null as Date | null,
  };

  if (params.rotateTokenId) {
    const [row] = await db
      .update(hostSyncTokens)
      .set({
        ...values,
        createdAt: now,
      })
      .where(
        and(
          eq(hostSyncTokens.id, params.rotateTokenId),
          eq(hostSyncTokens.ownerUserId, params.ownerUserId),
          eq(hostSyncTokens.orgId, params.orgId),
        ),
      )
      .returning();
    if (row) return { token: row, secret };
  }

  const [row] = await db.insert(hostSyncTokens).values(values).returning();
  if (!row) throw new Error("Failed to mint host sync token");
  return { token: row, secret };
}

/** Active (non-revoked) token for this user/org/hostname, if any. */
export async function findHostTokenByHostname(params: {
  ownerUserId: string;
  orgId: string;
  hostname: string;
}): Promise<HostSyncTokenRow | null> {
  const hostname = params.hostname.trim();
  if (!hostname) return null;
  const [row] = await db
    .select()
    .from(hostSyncTokens)
    .where(
      and(
        eq(hostSyncTokens.ownerUserId, params.ownerUserId),
        eq(hostSyncTokens.orgId, params.orgId),
        eq(hostSyncTokens.hostname, hostname),
        isNull(hostSyncTokens.revokedAt),
      ),
    )
    .orderBy(desc(hostSyncTokens.createdAt))
    .limit(1);
  return row ?? null;
}

export async function listHostTokens(
  ownerUserId: string,
  orgId: string,
): Promise<HostSyncTokenRow[]> {
  return db
    .select()
    .from(hostSyncTokens)
    .where(
      and(
        eq(hostSyncTokens.ownerUserId, ownerUserId),
        eq(hostSyncTokens.orgId, orgId),
        isNull(hostSyncTokens.revokedAt),
      ),
    )
    .orderBy(desc(hostSyncTokens.createdAt));
}

export async function getHostToken(
  id: string,
  ownerUserId: string,
  orgId: string,
): Promise<HostSyncTokenRow | null> {
  const [row] = await db
    .select()
    .from(hostSyncTokens)
    .where(
      and(
        eq(hostSyncTokens.id, id),
        eq(hostSyncTokens.ownerUserId, ownerUserId),
        eq(hostSyncTokens.orgId, orgId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function revokeHostToken(
  id: string,
  ownerUserId: string,
  orgId: string,
): Promise<HostSyncTokenRow | null> {
  const now = new Date();
  const [row] = await db
    .update(hostSyncTokens)
    .set({ revokedAt: now })
    .where(
      and(
        eq(hostSyncTokens.id, id),
        eq(hostSyncTokens.ownerUserId, ownerUserId),
        eq(hostSyncTokens.orgId, orgId),
        isNull(hostSyncTokens.revokedAt),
      ),
    )
    .returning();
  return row ?? null;
}

export async function updateHostTokenLabel(
  id: string,
  ownerUserId: string,
  orgId: string,
  label: string | null,
): Promise<HostSyncTokenRow | null> {
  const [row] = await db
    .update(hostSyncTokens)
    .set({ label: label?.trim() || null })
    .where(
      and(
        eq(hostSyncTokens.id, id),
        eq(hostSyncTokens.ownerUserId, ownerUserId),
        eq(hostSyncTokens.orgId, orgId),
        isNull(hostSyncTokens.revokedAt),
      ),
    )
    .returning();
  return row ?? null;
}

export async function touchHostToken(id: string): Promise<void> {
  await db
    .update(hostSyncTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(hostSyncTokens.id, id));
}

export async function hasActiveHostToken(orgId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: hostSyncTokens.id })
    .from(hostSyncTokens)
    .where(
      and(eq(hostSyncTokens.orgId, orgId), isNull(hostSyncTokens.revokedAt)),
    )
    .limit(1);
  return Boolean(row);
}

/**
 * Resolve a `hst_…` bearer secret. Expired (unrevoked) tokens throw
 * `HostTokenExpiredError` so ingest can return a refresh URL. Revoked or
 * unknown secrets return null.
 */
export async function resolveOwnerByHostToken(
  secret: string,
): Promise<HostTokenOwner | null> {
  const trimmed = secret.trim();
  if (!trimmed.startsWith(HOST_TOKEN_PREFIX)) return null;

  const [row] = await db
    .select()
    .from(hostSyncTokens)
    .where(eq(hostSyncTokens.keyHash, sha256Hex(trimmed)))
    .limit(1);

  if (!row) return null;
  if (row.revokedAt) return null;
  if (row.expiresAt <= new Date()) throw new HostTokenExpiredError();
  return {
    ownerUserId: row.ownerUserId,
    orgId: row.orgId,
    hostTokenId: row.id,
  };
}

export function hostTokenExpiresSoon(
  row: HostSyncTokenRow,
  now: Date = new Date(),
): boolean {
  if (!isUsable(row, now)) return false;
  return row.expiresAt.getTime() - now.getTime() <= HOST_TOKEN_WARN_MS;
}
