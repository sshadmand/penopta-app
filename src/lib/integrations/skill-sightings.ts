import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { syncSkillSightings } from "@/lib/db/schema";
import type { ProviderProjectProvider } from "@/lib/integrations/provider-projects";
import {
  evaluateSkillVersion,
  type SkillStatus,
} from "@/lib/integrations/skill-version";

export type SyncSkillSightingStatus = {
  provider: ProviderProjectProvider;
  lastSkillVersion: number | null;
  lastSeenAt: Date;
  skill: SkillStatus;
};

/** Upsert the latest skill-version report for an org + provider. */
export async function recordSyncSkillSighting(
  orgId: string,
  provider: ProviderProjectProvider,
  reported: number | null | undefined,
): Promise<void> {
  const now = new Date();
  const lastSkillVersion =
    typeof reported === "number" && Number.isInteger(reported) && reported > 0
      ? reported
      : null;

  await db
    .insert(syncSkillSightings)
    .values({
      orgId,
      provider,
      lastSkillVersion,
      lastSeenAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [syncSkillSightings.orgId, syncSkillSightings.provider],
      set: {
        lastSkillVersion,
        lastSeenAt: now,
        updatedAt: now,
      },
    });
}

/** Latest sighting for one provider, re-evaluated against the current skill. */
export async function getSyncSkillSighting(
  orgId: string,
  provider: ProviderProjectProvider,
): Promise<SyncSkillSightingStatus | null> {
  const [row] = await db
    .select()
    .from(syncSkillSightings)
    .where(
      and(
        eq(syncSkillSightings.orgId, orgId),
        eq(syncSkillSightings.provider, provider),
      ),
    )
    .limit(1);

  if (!row) return null;
  return {
    provider,
    lastSkillVersion: row.lastSkillVersion,
    lastSeenAt: row.lastSeenAt,
    skill: evaluateSkillVersion(row.lastSkillVersion),
  };
}

/** Latest sightings for every provider in the org (for the integrations list). */
export async function listSyncSkillSightings(
  orgId: string,
): Promise<SyncSkillSightingStatus[]> {
  const rows = await db
    .select()
    .from(syncSkillSightings)
    .where(eq(syncSkillSightings.orgId, orgId));

  return rows.map((row) => ({
    provider: row.provider,
    lastSkillVersion: row.lastSkillVersion,
    lastSeenAt: row.lastSeenAt,
    skill: evaluateSkillVersion(row.lastSkillVersion),
  }));
}
