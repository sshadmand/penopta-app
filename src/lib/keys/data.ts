import { and, desc, eq, gt } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import { db } from "@/lib/db/client";
import { userApiKeys, type UserApiKeyRow } from "@/lib/db/schema";

/** How long a minted key stays valid. */
export const API_KEY_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

/** Identity a valid key resolves to: the auth user acting in an org. */
export interface ApiKeyOwner {
  ownerUserId: string;
  orgId: string;
}

export class ActiveKeyExistsError extends Error {
  constructor(public readonly active: UserApiKeyRow) {
    super("An active key already exists until it expires.");
    this.name = "ActiveKeyExistsError";
  }
}

export class NoActiveKeyError extends Error {
  constructor() {
    super("No active key to invalidate.");
    this.name = "NoActiveKeyError";
  }
}

function generateKey(): string {
  return `pk_${randomBytes(24).toString("base64url")}`;
}

/** Current non-expired key for this user in this org, if any. */
export async function getActiveApiKey(
  ownerUserId: string,
  orgId: string,
): Promise<UserApiKeyRow | null> {
  const rows = await db
    .select()
    .from(userApiKeys)
    .where(
      and(
        eq(userApiKeys.ownerUserId, ownerUserId),
        eq(userApiKeys.orgId, orgId),
        gt(userApiKeys.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(userApiKeys.createdAt))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Expire every non-expired key for this user in this org immediately.
 * Returns how many rows were invalidated.
 */
export async function invalidateActiveApiKeys(
  ownerUserId: string,
  orgId: string,
): Promise<number> {
  const now = new Date();
  const rows = await db
    .update(userApiKeys)
    .set({ expiresAt: now })
    .where(
      and(
        eq(userApiKeys.ownerUserId, ownerUserId),
        eq(userApiKeys.orgId, orgId),
        gt(userApiKeys.expiresAt, now),
      ),
    )
    .returning({ id: userApiKeys.id });

  return rows.length;
}

/**
 * Mint a new key for a user in an org. Fails if an active key already exists
 * for that (user, org) — use `remintApiKey` to rotate.
 */
export async function mintApiKey(
  ownerUserId: string,
  orgId: string,
): Promise<UserApiKeyRow> {
  const active = await getActiveApiKey(ownerUserId, orgId);
  if (active) throw new ActiveKeyExistsError(active);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + API_KEY_TTL_MS);
  const key = generateKey();

  const rows = await db
    .insert(userApiKeys)
    .values({
      orgId,
      ownerUserId,
      key,
      expiresAt,
    })
    .returning();

  const created = rows[0];
  if (!created) throw new Error("Failed to mint API key");
  return created;
}

/** Invalidate the active key (if any) for this org, then mint a fresh one. */
export async function remintApiKey(
  ownerUserId: string,
  orgId: string,
): Promise<UserApiKeyRow> {
  await invalidateActiveApiKeys(ownerUserId, orgId);
  return mintApiKey(ownerUserId, orgId);
}

/**
 * Resolve the owner + org from an external key (expired keys do not match).
 * External agents sync into whichever org the key was minted for.
 */
export async function resolveOwnerByApiKey(
  key: string,
): Promise<ApiKeyOwner | null> {
  const trimmed = key.trim();
  if (!trimmed) return null;

  const rows = await db
    .select({
      ownerUserId: userApiKeys.ownerUserId,
      orgId: userApiKeys.orgId,
    })
    .from(userApiKeys)
    .where(
      and(eq(userApiKeys.key, trimmed), gt(userApiKeys.expiresAt, new Date())),
    )
    .limit(1);

  return rows[0] ?? null;
}
