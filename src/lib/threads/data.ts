import { and, desc, eq, or } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  agentThreads,
  availableProviderProjects,
  projects,
  projectSourceProjects,
  projectThreads,
  type AgentThreadRow,
} from "@/lib/db/schema";

/**
 * Agent threads in an org, most recently synced first.
 * Pass `ownerUserId` for credential-scoped MCP reads; omit it for org-wide
 * reads. Home/sidebar and add pickers use `listOwnedAgentThreads` so a
 * member can still see work they synced in another org (usually their space).
 */
export async function listAgentThreads(
  orgId: string,
  opts?: { ownerUserId?: string },
): Promise<AgentThreadRow[]> {
  const where = opts?.ownerUserId
    ? and(
        eq(agentThreads.orgId, orgId),
        eq(agentThreads.ownerUserId, opts.ownerUserId),
      )
    : eq(agentThreads.orgId, orgId);

  return db
    .select()
    .from(agentThreads)
    .where(where)
    .orderBy(desc(agentThreads.lastSyncedAt));
}

/**
 * The current user's agent threads, regardless of which org they were synced
 * into. Used by home/sidebar and create/add pickers so joining a team org
 * does not hide work that landed in their personal space.
 */
export async function listOwnedAgentThreads(
  ownerUserId: string,
): Promise<AgentThreadRow[]> {
  return db
    .select()
    .from(agentThreads)
    .where(eq(agentThreads.ownerUserId, ownerUserId))
    .orderBy(desc(agentThreads.lastSyncedAt));
}

/**
 * Distinct agent names (`claude`, `chatgpt`, …) that have synced at least one
 * thread into the org. Used to mark integrations as connected.
 */
export async function listSyncedAgentNames(orgId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ name: agentThreads.lastAgentName })
    .from(agentThreads)
    .where(eq(agentThreads.orgId, orgId));

  return rows.map((r) => r.name);
}

/**
 * Agent threads in a Penopta project: explicit `project_thread` picks plus
 * threads whose `project_context` matches a linked source (provider) project.
 * Join rows are scoped to `orgId`. Linked threads/catalog may live in the
 * member's personal space — those still appear after someone adds them.
 * Deduped; most recently synced first.
 */
export async function listProjectThreads(
  projectId: string,
  orgId: string,
): Promise<AgentThreadRow[]> {
  const contextMatch = or(
    eq(agentThreads.projectContext, availableProviderProjects.name),
    eq(
      agentThreads.projectContext,
      availableProviderProjects.externalProjectId,
    ),
  );

  const [explicit, viaSource] = await Promise.all([
    db
      .select({ thread: agentThreads })
      .from(projectThreads)
      .innerJoin(
        agentThreads,
        eq(agentThreads.id, projectThreads.agentThreadId),
      )
      .where(
        and(
          eq(projectThreads.projectId, projectId),
          eq(projectThreads.orgId, orgId),
        ),
      ),
    db
      .select({ thread: agentThreads })
      .from(projectSourceProjects)
      .innerJoin(
        availableProviderProjects,
        eq(
          availableProviderProjects.id,
          projectSourceProjects.availableProviderProjectId,
        ),
      )
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
          eq(projectSourceProjects.projectId, projectId),
          eq(projectSourceProjects.orgId, orgId),
        ),
      ),
  ]);

  const byId = new Map<string, AgentThreadRow>();
  for (const row of [...explicit, ...viaSource]) {
    byId.set(row.thread.id, row.thread);
  }

  return Array.from(byId.values()).sort(
    (a, b) => b.lastSyncedAt.getTime() - a.lastSyncedAt.getTime(),
  );
}

/** Explicit per-thread links only (not source-project membership). */
export async function listExplicitProjectThreadIds(
  projectId: string,
): Promise<string[]> {
  const rows = await db
    .select({ agentThreadId: projectThreads.agentThreadId })
    .from(projectThreads)
    .where(eq(projectThreads.projectId, projectId));
  return rows.map((r) => r.agentThreadId);
}

/** Catalog ids of source projects linked into a Penopta project. */
export async function listProjectSourceProjectIds(
  projectId: string,
  opts?: { addedByUserId?: string },
): Promise<string[]> {
  const where = opts?.addedByUserId
    ? and(
        eq(projectSourceProjects.projectId, projectId),
        eq(projectSourceProjects.addedByUserId, opts.addedByUserId),
      )
    : eq(projectSourceProjects.projectId, projectId);

  const rows = await db
    .select({
      id: projectSourceProjects.availableProviderProjectId,
    })
    .from(projectSourceProjects)
    .where(where);
  return rows.map((r) => r.id);
}

/**
 * First visible Penopta project in the org that already includes this source.
 */
export async function findVisibleProjectIdForSource(opts: {
  sourceId: string;
  orgId: string;
  viewerUserId: string;
}): Promise<string | null> {
  const rows = await db
    .select({ id: projects.id })
    .from(projectSourceProjects)
    .innerJoin(projects, eq(projects.id, projectSourceProjects.projectId))
    .where(
      and(
        eq(projectSourceProjects.availableProviderProjectId, opts.sourceId),
        eq(projects.orgId, opts.orgId),
        or(
          eq(projects.visibility, "public"),
          eq(projects.ownerUserId, opts.viewerUserId),
        ),
      ),
    )
    .orderBy(desc(projects.updatedAt))
    .limit(1);

  return rows[0]?.id ?? null;
}

/**
 * True when any project in the org has an agent thread or source project
 * hooked up. Home uses this to swap the add-data empty state for summaries.
 */
export async function orgHasLinkedAgents(orgId: string): Promise<boolean> {
  const [threadLinks, sourceLinks] = await Promise.all([
    db
      .select({ id: projectThreads.id })
      .from(projectThreads)
      .where(eq(projectThreads.orgId, orgId))
      .limit(1),
    db
      .select({ id: projectSourceProjects.id })
      .from(projectSourceProjects)
      .where(eq(projectSourceProjects.orgId, orgId))
      .limit(1),
  ]);

  return threadLinks.length > 0 || sourceLinks.length > 0;
}

/** A single thread in an org by its internal id, or null if not found. */
export async function getAgentThread(
  orgId: string,
  id: string,
): Promise<AgentThreadRow | null> {
  const rows = await db
    .select()
    .from(agentThreads)
    .where(and(eq(agentThreads.id, id), eq(agentThreads.orgId, orgId)))
    .limit(1);

  return rows[0] ?? null;
}

/** A thread the user owns, regardless of which org it was synced into. */
export async function getOwnedAgentThread(
  ownerUserId: string,
  id: string,
): Promise<AgentThreadRow | null> {
  const rows = await db
    .select()
    .from(agentThreads)
    .where(
      and(eq(agentThreads.id, id), eq(agentThreads.ownerUserId, ownerUserId)),
    )
    .limit(1);

  return rows[0] ?? null;
}

/**
 * A single thread in an org by the producing agent's stable thread id
 * (payload `threadId`), or null if not found.
 */
export async function getAgentThreadByExternalId(
  orgId: string,
  externalThreadId: string,
): Promise<AgentThreadRow | null> {
  const rows = await db
    .select()
    .from(agentThreads)
    .where(
      and(
        eq(agentThreads.orgId, orgId),
        eq(agentThreads.threadId, externalThreadId),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}
