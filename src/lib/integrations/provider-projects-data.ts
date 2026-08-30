import {
  and,
  asc,
  eq,
  inArray,
  isNotNull,
  min,
  ne,
  or,
  sql,
} from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  agentThreads,
  availableProviderProjects,
  type AvailableProviderProjectRow,
} from "@/lib/db/schema";
import { isPrivateProjectName } from "@/lib/ingest/data";
import { PENOPTA_SYNC_LINUX_AGENT_ID } from "@/lib/host-sync/linux";
import type { ProviderProjectProvider } from "@/lib/integrations/provider-projects";
import type {
  AvailableProviderProject,
  ProviderProjectSource,
} from "@/lib/integrations/provider-projects-view";

export type { AvailableProviderProject, ProviderProjectSource };
export { PROVIDER_PROJECT_SOURCE_LABEL } from "@/lib/integrations/provider-projects-view";

/** Mac menu-bar companion agent id (see Penopta Sync SyncEngine). */
export const PENOPTA_SYNC_AGENT_ID = "penopta-sync-macos";

export { PENOPTA_SYNC_LINUX_AGENT_ID };

const CATALOG_SOURCES: ProviderProjectSource[] = [
  "penopta_sync",
  "penopta_sync_linux",
  "skill",
];

function toPublic(row: AvailableProviderProjectRow): AvailableProviderProject {
  const source = CATALOG_SOURCES.includes(row.source as ProviderProjectSource)
    ? (row.source as ProviderProjectSource)
    : null;
  return {
    id: row.id,
    provider: row.provider,
    projectId: row.externalProjectId,
    name: row.name,
    createdAt: row.projectCreatedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
    source,
    tracked: row.tracked,
    sidebarHidden: row.sidebarHidden,
  };
}

/**
 * Map an agent sync producer onto the integrations catalog provider.
 * Local Claude Code → Claude; Cursor mac sync → Cursor; Codex has no
 * dedicated catalog page (maps under ChatGPT status only via macSync names).
 */
export function catalogProviderForAgent(input: {
  agentName?: string | null;
  kind?: string | null;
}): ProviderProjectProvider | null {
  const tokens = [input.agentName, input.kind]
    .map((v) => v?.trim().toLowerCase())
    .filter((v): v is string => Boolean(v));

  for (const token of tokens) {
    if (token === "chatgpt" || token === "openai" || token === "codex") {
      return "chatgpt";
    }
    if (
      token === "claude" ||
      token === "claude-code" ||
      token === "anthropic"
    ) {
      return "claude";
    }
    if (token === "cursor") return "cursor";
  }
  return null;
}

/** Drop any catalog rows whose names are private-prefixed (safety cleanup). */
async function deletePrivateCatalogRows(
  rows: AvailableProviderProjectRow[],
): Promise<AvailableProviderProjectRow[]> {
  const privateIds = rows
    .filter((r) => isPrivateProjectName(r.name))
    .map((r) => r.id);
  if (privateIds.length > 0) {
    await db
      .delete(availableProviderProjects)
      .where(inArray(availableProviderProjects.id, privateIds));
  }
  return rows.filter((r) => !isPrivateProjectName(r.name));
}

/** List available provider projects for an org, optionally filtered by provider. */
export async function listAvailableProviderProjects(
  orgId: string,
  provider?: ProviderProjectProvider,
): Promise<AvailableProviderProject[]> {
  const rows = await db
    .select()
    .from(availableProviderProjects)
    .where(
      provider
        ? and(
            eq(availableProviderProjects.orgId, orgId),
            eq(availableProviderProjects.provider, provider),
          )
        : eq(availableProviderProjects.orgId, orgId),
    )
    .orderBy(asc(availableProviderProjects.name));

  const kept = await deletePrivateCatalogRows(rows);
  return kept.map(toPublic);
}

/**
 * Prefer the active-org catalog row when the same provider project was
 * registered in more than one org (personal + team).
 */
function dedupeCatalogPreferOrg(
  rows: AvailableProviderProjectRow[],
  preferredOrgId: string,
): AvailableProviderProjectRow[] {
  const byKey = new Map<string, AvailableProviderProjectRow>();
  for (const row of rows) {
    const key = `${row.provider}:${row.externalProjectId}`;
    const existing = byKey.get(key);
    if (!existing || row.orgId === preferredOrgId) {
      byKey.set(key, row);
    }
  }
  return Array.from(byKey.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

/**
 * Source (provider) projects the user can add to a Penopta project: catalog
 * rows they registered (any org), plus active-org rows whose name/id matches
 * one of their threads. Joining a team org does not hide work they already
 * synced. Teammates only see them after someone links them into a shared
 * Penopta project.
 */
export async function listMyAvailableProviderProjects(
  orgId: string,
  ownerUserId: string,
): Promise<AvailableProviderProject[]> {
  const contextRows = await db
    .selectDistinct({ projectContext: agentThreads.projectContext })
    .from(agentThreads)
    .where(
      and(
        eq(agentThreads.ownerUserId, ownerUserId),
        isNotNull(agentThreads.projectContext),
        ne(agentThreads.projectContext, ""),
      ),
    );

  const contexts = contextRows
    .map((row) => row.projectContext?.trim())
    .filter((value): value is string => Boolean(value));

  const contextMatch =
    contexts.length > 0
      ? or(
          ...contexts.flatMap((context) => [
            eq(availableProviderProjects.name, context),
            eq(availableProviderProjects.externalProjectId, context),
          ]),
        )
      : undefined;

  const rows = await db
    .select()
    .from(availableProviderProjects)
    .where(
      contextMatch
        ? or(
            eq(availableProviderProjects.ownerUserId, ownerUserId),
            and(eq(availableProviderProjects.orgId, orgId), contextMatch),
          )
        : eq(availableProviderProjects.ownerUserId, ownerUserId),
    )
    .orderBy(asc(availableProviderProjects.name));

  const kept = await deletePrivateCatalogRows(rows);
  return dedupeCatalogPreferOrg(kept, orgId).map(toPublic);
}

/**
 * Seed the available-projects catalog from projects already seen on synced
 * agent threads. First source to land data (Mac app, Linux host sync, or the
 * scheduled skill) is enough to populate the integrations page.
 */
export async function ensureCatalogFromAgentThreads(
  ownerUserId: string,
  orgId: string,
  provider: ProviderProjectProvider,
): Promise<{ inserted: number; updated: number }> {
  const nameFilters =
    provider === "claude"
      ? or(
          eq(agentThreads.lastAgentName, "claude-code"),
          eq(agentThreads.lastAgentName, "claude"),
          eq(agentThreads.kind, "claude-code"),
          eq(agentThreads.kind, "claude"),
        )
      : provider === "cursor"
        ? or(
            eq(agentThreads.lastAgentName, "cursor"),
            eq(agentThreads.kind, "cursor"),
          )
        : or(
            eq(agentThreads.lastAgentName, "chatgpt"),
            eq(agentThreads.lastAgentName, "codex"),
            eq(agentThreads.kind, "chatgpt"),
            eq(agentThreads.kind, "codex"),
          );

  const rows = await db
    .select({
      projectContext: agentThreads.projectContext,
      earliestThread: min(agentThreads.threadCreatedAt),
      earliestRow: min(agentThreads.createdAt),
      earliestSynced: min(agentThreads.lastSyncedAt),
      fromPenoptaSync: sql<number>`count(*) filter (where ${agentThreads.lastAgentId} = ${PENOPTA_SYNC_AGENT_ID})`,
      fromLinuxSync: sql<number>`count(*) filter (where ${agentThreads.lastAgentId} = ${PENOPTA_SYNC_LINUX_AGENT_ID})`,
    })
    .from(agentThreads)
    .where(
      and(
        eq(agentThreads.orgId, orgId),
        isNotNull(agentThreads.projectContext),
        ne(agentThreads.projectContext, ""),
        nameFilters,
      ),
    )
    .groupBy(agentThreads.projectContext);

  const projects = rows
    .map((row) => {
      const name = row.projectContext?.trim();
      if (!name || isPrivateProjectName(name)) return null;
      const candidates = [
        row.earliestThread,
        row.earliestRow,
        row.earliestSynced,
      ].filter(
        (d): d is Date => d instanceof Date && !Number.isNaN(d.getTime()),
      );
      const earliest =
        candidates.length > 0
          ? new Date(Math.min(...candidates.map((d) => d.getTime())))
          : null;
      const source: ProviderProjectSource =
        Number(row.fromPenoptaSync) > 0
          ? "penopta_sync"
          : Number(row.fromLinuxSync) > 0
            ? "penopta_sync_linux"
            : "skill";
      return {
        // Local folder / workspace names are the stable id until the skill
        // registers a richer provider id for the same project.
        projectId: name,
        name,
        createdAt: earliest?.toISOString() ?? null,
        source,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  if (projects.length === 0) return { inserted: 0, updated: 0 };

  const result = await makeProviderProjectsAvailable(
    ownerUserId,
    orgId,
    provider,
    projects,
  );
  return { inserted: result.inserted, updated: result.updated };
}

/** Projects Penopta already knows about for a provider (MCP `known_projects`). */
export async function listKnownProviderProjects(
  orgId: string,
  provider: ProviderProjectProvider,
): Promise<AvailableProviderProject[]> {
  return listAvailableProviderProjects(orgId, provider);
}

/**
 * Tracked projects the skill should sync (MCP `tracked_projects`).
 * Private-prefixed names are never returned (and are deleted if found).
 */
export async function listTrackedProviderProjects(
  orgId: string,
  provider: ProviderProjectProvider,
): Promise<AvailableProviderProject[]> {
  const all = await listAvailableProviderProjects(orgId, provider);
  return all.filter((p) => p.tracked);
}

export type MakeAvailableInput = {
  projectId: string;
  name: string;
  createdAt?: string | null;
  /** Defaults to `skill` (MCP make_projects_available). */
  source?: ProviderProjectSource;
};

/**
 * Upsert provider project metadata into the available catalog. Never changes
 * `tracked`. Skips (and deletes any existing) private-prefixed names — those
 * must never be stored. `source` is set on insert and backfilled when null;
 * an existing source is kept (first writer wins).
 */
export async function makeProviderProjectsAvailable(
  ownerUserId: string,
  orgId: string,
  provider: ProviderProjectProvider,
  projects: MakeAvailableInput[],
): Promise<{
  inserted: number;
  updated: number;
  skippedPrivate: number;
  projects: AvailableProviderProject[];
}> {
  let inserted = 0;
  let updated = 0;
  let skippedPrivate = 0;
  const results: AvailableProviderProject[] = [];

  for (const item of projects) {
    const projectId = item.projectId.trim();
    const name = item.name.trim();
    if (!projectId || !name) continue;
    const source: ProviderProjectSource = item.source ?? "skill";

    const existing = await db
      .select()
      .from(availableProviderProjects)
      .where(
        and(
          eq(availableProviderProjects.orgId, orgId),
          eq(availableProviderProjects.provider, provider),
          eq(availableProviderProjects.externalProjectId, projectId),
        ),
      )
      .limit(1);

    // Never store private-prefixed projects; remove if already present.
    if (isPrivateProjectName(name)) {
      skippedPrivate += 1;
      if (existing[0]) {
        await db
          .delete(availableProviderProjects)
          .where(eq(availableProviderProjects.id, existing[0].id));
      }
      continue;
    }

    let projectCreatedAt: Date | null = null;
    if (item.createdAt) {
      const parsed = new Date(item.createdAt);
      if (!Number.isNaN(parsed.getTime())) projectCreatedAt = parsed;
    }

    const now = new Date();

    if (existing[0]) {
      // Existing row became private under a prior name — also drop it.
      if (isPrivateProjectName(existing[0].name)) {
        skippedPrivate += 1;
        await db
          .delete(availableProviderProjects)
          .where(eq(availableProviderProjects.id, existing[0].id));
        continue;
      }

      const [row] = await db
        .update(availableProviderProjects)
        .set({
          name,
          projectCreatedAt:
            projectCreatedAt ?? existing[0].projectCreatedAt ?? null,
          // First writer wins; backfill only when missing.
          source: existing[0].source ?? source,
          // Keep the original registrant — do not steal ownership on re-sync.
          updatedAt: now,
        })
        .where(eq(availableProviderProjects.id, existing[0].id))
        .returning();
      updated += 1;
      results.push(toPublic(row));
    } else {
      const [row] = await db
        .insert(availableProviderProjects)
        .values({
          orgId,
          ownerUserId,
          provider,
          externalProjectId: projectId,
          name,
          projectCreatedAt,
          source,
          tracked: false,
          updatedAt: now,
        })
        .returning();
      inserted += 1;
      results.push(toPublic(row));
    }
  }

  return { inserted, updated, skippedPrivate, projects: results };
}

/**
 * Set tracked for a catalog row in the active org. Private names cannot be
 * tracked and are deleted if found.
 */
export async function setProviderProjectTracked(
  orgId: string,
  id: string,
  tracked: boolean,
): Promise<
  { ok: true; project: AvailableProviderProject } | { ok: false; error: string }
> {
  const [row] = await db
    .select()
    .from(availableProviderProjects)
    .where(
      and(
        eq(availableProviderProjects.id, id),
        eq(availableProviderProjects.orgId, orgId),
      ),
    )
    .limit(1);

  if (!row) return { ok: false, error: "Project not found." };
  if (isPrivateProjectName(row.name)) {
    await db
      .delete(availableProviderProjects)
      .where(eq(availableProviderProjects.id, id));
    return {
      ok: false,
      error:
        "Private projects (names starting with P: or Private:) are not stored.",
    };
  }

  const [updated] = await db
    .update(availableProviderProjects)
    .set({ tracked, updatedAt: new Date() })
    .where(eq(availableProviderProjects.id, id))
    .returning();

  return { ok: true, project: toPublic(updated) };
}

/**
 * Opt catalog rows into transcript sync. Used when a source project is added
 * to a Penopta project — that is the permission to start tracking.
 */
export async function markProviderProjectsTracked(
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  await db
    .update(availableProviderProjects)
    .set({ tracked: true, updatedAt: new Date() })
    .where(inArray(availableProviderProjects.id, ids));
}

/**
 * Hide or restore a catalog row in the Home Untracked list. Integrations
 * still lists it. Accepts any source the caller can claim (same as pickers).
 */
export async function setProviderProjectSidebarHidden(
  orgId: string,
  ownerUserId: string,
  id: string,
  hidden: boolean,
): Promise<
  { ok: true; project: AvailableProviderProject } | { ok: false; error: string }
> {
  const mine = await listMyAvailableProviderProjects(orgId, ownerUserId);
  if (!mine.some((project) => project.id === id)) {
    return { ok: false, error: "Project not found." };
  }

  const [updated] = await db
    .update(availableProviderProjects)
    .set({ sidebarHidden: hidden, updatedAt: new Date() })
    .where(eq(availableProviderProjects.id, id))
    .returning();

  if (!updated) return { ok: false, error: "Project not found." };
  return { ok: true, project: toPublic(updated) };
}
