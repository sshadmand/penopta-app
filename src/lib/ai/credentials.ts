import { and, eq } from "drizzle-orm";

import {
  decryptSecret,
  encryptSecret,
  secretLast4,
} from "@/lib/crypto/secrets";
import { db } from "@/lib/db/client";
import {
  orgLlmCredentials,
  type LlmProvider,
  type OrgLlmCredentialRow,
} from "@/lib/db/schema";
import type { LlmCredentialPublic } from "@/lib/ai/models";

export type { LlmCredentialPublic };

/** Non-secret listing for settings UI. */
export async function listOrgLlmCredentials(
  orgId: string,
): Promise<LlmCredentialPublic[]> {
  const rows = await db
    .select({
      provider: orgLlmCredentials.provider,
      keyLast4: orgLlmCredentials.keyLast4,
      model: orgLlmCredentials.model,
      updatedAt: orgLlmCredentials.updatedAt,
    })
    .from(orgLlmCredentials)
    .where(eq(orgLlmCredentials.orgId, orgId));

  return rows;
}

export async function hasAnyOrgLlmCredential(orgId: string): Promise<boolean> {
  const rows = await db
    .select({ id: orgLlmCredentials.id })
    .from(orgLlmCredentials)
    .where(eq(orgLlmCredentials.orgId, orgId))
    .limit(1);
  return rows.length > 0;
}

/** Upsert an encrypted provider key for the org. */
export async function upsertOrgLlmCredential(opts: {
  orgId: string;
  provider: LlmProvider;
  apiKey: string;
  model?: string | null;
  createdByUserId: string;
}): Promise<OrgLlmCredentialRow> {
  const apiKey = opts.apiKey.trim();
  if (!apiKey) throw new Error("API key is required.");

  const enc = encryptSecret(apiKey);
  const now = new Date();
  const model = opts.model?.trim() || null;

  const rows = await db
    .insert(orgLlmCredentials)
    .values({
      orgId: opts.orgId,
      provider: opts.provider,
      ciphertext: enc.ciphertext,
      iv: enc.iv,
      authTag: enc.authTag,
      keyLast4: secretLast4(apiKey),
      model,
      createdByUserId: opts.createdByUserId,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [orgLlmCredentials.orgId, orgLlmCredentials.provider],
      set: {
        ciphertext: enc.ciphertext,
        iv: enc.iv,
        authTag: enc.authTag,
        keyLast4: secretLast4(apiKey),
        model,
        createdByUserId: opts.createdByUserId,
        updatedAt: now,
      },
    })
    .returning();

  const row = rows[0];
  if (!row) throw new Error("Failed to save LLM credential.");
  return row;
}

export async function deleteOrgLlmCredential(
  orgId: string,
  provider: LlmProvider,
): Promise<boolean> {
  const rows = await db
    .delete(orgLlmCredentials)
    .where(
      and(
        eq(orgLlmCredentials.orgId, orgId),
        eq(orgLlmCredentials.provider, provider),
      ),
    )
    .returning({ id: orgLlmCredentials.id });
  return rows.length > 0;
}

/** Decrypt a stored key for server-side model calls only. */
export async function getDecryptedOrgLlmCredential(
  orgId: string,
  provider: LlmProvider,
): Promise<{ apiKey: string; model: string | null } | null> {
  const rows = await db
    .select()
    .from(orgLlmCredentials)
    .where(
      and(
        eq(orgLlmCredentials.orgId, orgId),
        eq(orgLlmCredentials.provider, provider),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    apiKey: decryptSecret({
      ciphertext: row.ciphertext,
      iv: row.iv,
      authTag: row.authTag,
    }),
    model: row.model,
  };
}
