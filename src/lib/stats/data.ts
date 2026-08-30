import { and, eq, inArray, or, sql } from "drizzle-orm";

import { lookupUsers } from "@/lib/auth/users";
import { db } from "@/lib/db/client";
import {
  agentThreadSnapshots,
  agentThreads,
  availableProviderProjects,
  orgActivityThreads,
  projects,
  projectSourceProjects,
  projectThreads,
} from "@/lib/db/schema";
import { listAvailableProviderProjects } from "@/lib/integrations/provider-projects-data";
import { resolveSourceProjectLabel } from "@/lib/integrations/provider-projects-view";
import {
  type ActivitySlice,
  type StatsFilterOption,
  UNGROUPED_PROJECT_FILTER,
  formatAgentLabel,
} from "@/lib/stats/activity";
import type { AttributedTurn, ThreadProjectLink } from "@/lib/stats/effort";
import {
  SOURCE_RANK_CURRENT,
  asIso,
  filterSinceDay,
  rollupFromSources,
  statsSinceDay,
  threadSourceFingerprint,
  type RollupSource,
} from "@/lib/stats/rollup";

function chunkItems<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Neon HTTP rejects result payloads over 64MB. After a migrate the rollup
 * table is empty, so home used to SELECT every snapshot transcript at once.
 * Recompute from the current thread row only, a few at a time.
 */
const ROLLUP_THREAD_CHUNK = 4;

function asNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function asSliceList(value: unknown): ActivitySlice[] {
  return Array.isArray(value) ? (value as ActivitySlice[]) : [];
}

function asPlanList(value: unknown): AttributedTurn[] {
  return Array.isArray(value) ? (value as AttributedTurn[]) : [];
}

type ThreadMetaRow = {
  threadId: string;
  agentName: string;
  agentModel: string;
  projectContext: string | null;
  activityHash: string;
};

type SnapshotMetaRow = {
  threadId: string;
  snapshotCount: unknown;
  snapshotMaxAt: Date | string | null;
};

function fingerprintsFromMeta(
  threads: ThreadMetaRow[],
  snapshots: SnapshotMetaRow[],
): Map<string, string> {
  const snapByThread = new Map<string, SnapshotMetaRow>();
  for (const row of snapshots) snapByThread.set(row.threadId, row);

  const out = new Map<string, string>();
  const ids = new Set<string>();
  for (const row of threads) ids.add(row.threadId);
  for (const row of snapshots) ids.add(row.threadId);

  const threadById = new Map(threads.map((row) => [row.threadId, row]));
  for (const threadId of ids) {
    const current = threadById.get(threadId);
    const snap = snapByThread.get(threadId);
    out.set(
      threadId,
      threadSourceFingerprint({
        activityHash: current?.activityHash ?? "",
        projectContext: current?.projectContext ?? "",
        agentName: current?.agentName ?? "",
        agentModel: current?.agentModel ?? "",
        snapshotCount: asNumber(snap?.snapshotCount),
        snapshotMaxAt: asIso(snap?.snapshotMaxAt) ?? "",
      }),
    );
  }
  return out;
}

async function listThreadFingerprints(
  orgId: string,
): Promise<Map<string, string>> {
  const [threads, snapshots] = await Promise.all([
    db
      .select({
        threadId: agentThreads.threadId,
        ownerUserId: agentThreads.ownerUserId,
        agentName: agentThreads.lastAgentName,
        agentModel: agentThreads.lastAgentModel,
        projectContext: agentThreads.projectContext,
        activityHash: sql<string>`md5((${agentThreads.sourceActivity})::text)`,
      })
      .from(agentThreads)
      .where(eq(agentThreads.orgId, orgId)),
    db
      .select({
        threadId: agentThreadSnapshots.threadId,
        snapshotCount: sql<number>`count(*)::int`,
        snapshotMaxAt: sql<
          Date | string | null
        >`max(${agentThreadSnapshots.createdAt})`,
      })
      .from(agentThreadSnapshots)
      .where(eq(agentThreadSnapshots.orgId, orgId))
      .groupBy(agentThreadSnapshots.threadId),
  ]);
  return fingerprintsFromMeta(threads, snapshots);
}

async function fetchRollupSources(
  orgId: string,
  threadIds: string[],
): Promise<Map<string, RollupSource[]>> {
  const byThread = new Map<string, RollupSource[]>();
  if (threadIds.length === 0) return byThread;

  const currents = await Promise.all(
    threadIds.map((threadId) =>
      db
        .select({
          threadId: agentThreads.threadId,
          ownerUserId: agentThreads.ownerUserId,
          agentName: agentThreads.lastAgentName,
          agentModel: agentThreads.lastAgentModel,
          projectContext: agentThreads.projectContext,
          threadUpdatedAt: agentThreads.threadUpdatedAt,
          sourceActivity: agentThreads.sourceActivity,
        })
        .from(agentThreads)
        .where(
          and(
            eq(agentThreads.orgId, orgId),
            eq(agentThreads.threadId, threadId),
          ),
        )
        .limit(1),
    ),
  );

  for (const row of currents.flat()) {
    byThread.set(row.threadId, [
      {
        threadId: row.threadId,
        ownerUserId: row.ownerUserId,
        agentName: row.agentName,
        agentModel: row.agentModel,
        projectContext: row.projectContext,
        threadUpdatedAt: row.threadUpdatedAt,
        sourceActivity: row.sourceActivity ?? [],
        sourceRank: SOURCE_RANK_CURRENT,
      },
    ]);
  }
  return byThread;
}

async function refreshStaleThreadRollups(
  orgId: string,
  staleIds: string[],
  fingerprints: Map<string, string>,
): Promise<
  { threadId: string; slices: ActivitySlice[]; planSlices: AttributedTurn[] }[]
> {
  if (staleIds.length === 0) return [];
  const computedAt = new Date();
  const out: {
    threadId: string;
    slices: ActivitySlice[];
    planSlices: AttributedTurn[];
  }[] = [];

  for (const ids of chunkItems(staleIds, ROLLUP_THREAD_CHUNK)) {
    const sources = await fetchRollupSources(orgId, ids);
    const rows = ids.map((threadId) => {
      const rollup = rollupFromSources(sources.get(threadId) ?? []);
      return {
        orgId,
        threadId,
        slices: rollup.slices,
        planSlices: rollup.planSlices,
        sourceFingerprint: fingerprints.get(threadId) ?? "",
        computedAt,
      };
    });

    await db
      .insert(orgActivityThreads)
      .values(rows)
      .onConflictDoUpdate({
        target: [orgActivityThreads.orgId, orgActivityThreads.threadId],
        set: {
          slices: sql`excluded.slices`,
          planSlices: sql`excluded.plan_slices`,
          sourceFingerprint: sql`excluded.source_fingerprint`,
          computedAt: sql`excluded.computed_at`,
        },
      });

    for (const row of rows) {
      out.push({
        threadId: row.threadId,
        slices: row.slices,
        planSlices: row.planSlices,
      });
    }
  }

  return out;
}

/**
 * Cached per-thread slices + plan buckets for ~53 weeks.
 * Stale threads are recomputed from the current transcript (not the full
 * snapshot history — that payload exceeds Neon's 64MB HTTP cap).
 */
export async function loadOrgActivityRollups(orgId: string): Promise<{
  slices: ActivitySlice[];
  planTurns: AttributedTurn[];
}> {
  const [cached, fingerprints] = await Promise.all([
    db
      .select({
        threadId: orgActivityThreads.threadId,
        slices: orgActivityThreads.slices,
        planSlices: orgActivityThreads.planSlices,
        sourceFingerprint: orgActivityThreads.sourceFingerprint,
      })
      .from(orgActivityThreads)
      .where(eq(orgActivityThreads.orgId, orgId)),
    listThreadFingerprints(orgId),
  ]);

  const cachedById = new Map(cached.map((row) => [row.threadId, row]));
  const staleIds: string[] = [];
  for (const [threadId, fingerprint] of fingerprints) {
    const row = cachedById.get(threadId);
    if (!row || row.sourceFingerprint !== fingerprint) staleIds.push(threadId);
  }

  const liveIds = new Set(fingerprints.keys());
  const orphanIds = cached
    .map((row) => row.threadId)
    .filter((threadId) => !liveIds.has(threadId));
  if (orphanIds.length > 0) {
    await db
      .delete(orgActivityThreads)
      .where(
        and(
          eq(orgActivityThreads.orgId, orgId),
          inArray(orgActivityThreads.threadId, orphanIds),
        ),
      );
  }

  const refreshed = await refreshStaleThreadRollups(
    orgId,
    staleIds,
    fingerprints,
  );
  const refreshedById = new Map(refreshed.map((row) => [row.threadId, row]));

  const slices: ActivitySlice[] = [];
  const planTurns: AttributedTurn[] = [];
  for (const threadId of fingerprints.keys()) {
    const fresh = refreshedById.get(threadId);
    const row = cachedById.get(threadId);
    const nextSlices = fresh?.slices ?? asSliceList(row?.slices);
    const nextPlans = fresh?.planSlices ?? asPlanList(row?.planSlices);
    slices.push(...nextSlices);
    planTurns.push(...nextPlans);
  }

  const sinceDay = statsSinceDay();
  return {
    slices: filterSinceDay(slices, sinceDay),
    planTurns: filterSinceDay(planTurns, sinceDay),
  };
}

/**
 * Daily activity slices for the active org, covering ~53 weeks.
 * Unions current thread transcripts with per-run snapshots, then dedupes
 * turns so overlapping sync windows are not counted twice.
 */
export async function listOrgActivitySlices(
  orgId: string,
): Promise<ActivitySlice[]> {
  const { slices } = await loadOrgActivityRollups(orgId);
  return slices;
}

export type OrgActivityStats = {
  slices: ActivitySlice[];
  people: StatsFilterOption[];
  agents: StatsFilterOption[];
  projects: StatsFilterOption[];
  planTurns: AttributedTurn[];
  threadProjects: ThreadProjectLink[];
};

/** Activity slices plus display labels for the three lenses. */
export async function loadOrgActivityStats(
  orgId: string,
  viewer: { id: string; name?: string | null; email?: string | null },
): Promise<OrgActivityStats> {
  const [rollups, catalog, threadProjects] = await Promise.all([
    loadOrgActivityRollups(orgId),
    listAvailableProviderProjects(orgId),
    listThreadPenoptaProjects(orgId, viewer.id),
  ]);
  const { slices, planTurns } = rollups;

  const catalogEntries = catalog.map((project) => ({
    name: project.name,
    projectId: project.projectId,
  }));

  const ownerIds = [...new Set(slices.map((s) => s.ownerUserId))];
  const directory = await lookupUsers(ownerIds);

  const peopleMap = new Map<string, string>();
  peopleMap.set(viewer.id, viewer.name || viewer.email || "You");
  for (const [id, user] of directory) {
    peopleMap.set(id, user.name || user.email || id);
  }

  const people = ownerIds
    .map((value) => ({
      value,
      label: peopleMap.get(value) ?? value,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const agentNames = [...new Set(slices.map((s) => s.agentName))].sort((a, b) =>
    a.localeCompare(b),
  );
  const agents = agentNames.map((value) => ({
    value,
    label: formatAgentLabel(value),
  }));

  const projectKeys = [
    ...new Set(slices.map((s) => s.projectContext?.trim() || "")),
  ];
  const projects = projectKeys
    .map((value) => ({
      value: value || UNGROUPED_PROJECT_FILTER,
      label:
        resolveSourceProjectLabel(value || null, catalogEntries) ??
        "No source project",
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return { slices, people, agents, projects, planTurns, threadProjects };
}

/**
 * Per-turn rows with static plan attribution (named file + operational
 * follow-ups). Same transcript dedupe window as the heatmap.
 */
export async function listOrgAttributedTurns(
  orgId: string,
): Promise<AttributedTurn[]> {
  const { planTurns } = await loadOrgActivityRollups(orgId);
  return planTurns;
}

type ThreadProjectQueryRow = {
  threadId: string;
  projectId: string;
  projectName: string;
};

/** Visible workgroups each producer threadId belongs to. */
export async function listThreadPenoptaProjects(
  orgId: string,
  viewerUserId: string,
): Promise<ThreadProjectLink[]> {
  const visible = or(
    eq(projects.visibility, "public"),
    eq(projects.ownerUserId, viewerUserId),
  );
  const contextMatch = or(
    eq(agentThreads.projectContext, availableProviderProjects.name),
    eq(
      agentThreads.projectContext,
      availableProviderProjects.externalProjectId,
    ),
  );

  const [explicit, viaSource] = await Promise.all([
    db
      .select({
        threadId: agentThreads.threadId,
        projectId: projects.id,
        projectName: projects.name,
      })
      .from(projectThreads)
      .innerJoin(
        agentThreads,
        eq(agentThreads.id, projectThreads.agentThreadId),
      )
      .innerJoin(projects, eq(projects.id, projectThreads.projectId))
      .where(
        and(
          eq(projectThreads.orgId, orgId),
          eq(projects.orgId, orgId),
          visible,
        ),
      ),
    db
      .select({
        threadId: agentThreads.threadId,
        projectId: projects.id,
        projectName: projects.name,
      })
      .from(projectSourceProjects)
      .innerJoin(
        availableProviderProjects,
        eq(
          availableProviderProjects.id,
          projectSourceProjects.availableProviderProjectId,
        ),
      )
      .innerJoin(projects, eq(projects.id, projectSourceProjects.projectId))
      .innerJoin(
        agentThreads,
        and(
          or(
            eq(agentThreads.orgId, orgId),
            and(
              eq(
                agentThreads.ownerUserId,
                availableProviderProjects.ownerUserId,
              ),
              eq(agentThreads.orgId, availableProviderProjects.orgId),
            ),
          ),
          contextMatch,
        ),
      )
      .where(
        and(
          eq(projectSourceProjects.orgId, orgId),
          eq(projects.orgId, orgId),
          visible,
        ),
      ),
  ]);

  const seen = new Set<string>();
  const links: ThreadProjectLink[] = [];
  for (const row of [...explicit, ...viaSource] as ThreadProjectQueryRow[]) {
    const key = `${row.threadId}\0${row.projectId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({
      threadId: row.threadId,
      projectId: row.projectId,
      projectName: row.projectName,
    });
  }
  return links;
}
