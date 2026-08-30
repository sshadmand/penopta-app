import { resolveSourceProjectLabel } from "@/lib/integrations/provider-projects-view";
import type { SourceActivityItem } from "@/lib/db/schema";

/** Label for threads with no source project context. */
export const UNGROUPED_SOURCE_PROJECT_LABEL = "No source project";

export type GroupableThread = {
  id: string;
  title: string;
  lastAgentName: string;
  status: string;
  ownerUserId: string;
  projectContext?: string | null;
  threadUpdatedAt?: Date | string | null;
  lastSyncedAt?: Date | string | null;
  sourceActivity?: SourceActivityItem[];
};

export type ThreadAgentGroup = {
  agent: string;
  threads: GroupableThread[];
};

export type ThreadOwnerGroup = {
  ownerUserId: string;
  agents: ThreadAgentGroup[];
};

export type ThreadProjectGroup = {
  projectLabel: string;
  owners: ThreadOwnerGroup[];
};

type SourceCatalogEntry = { name: string; projectId: string };

function toMillis(value: Date | string | null | undefined): number | null {
  if (value == null) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Best-effort "most recent message" time: latest activity timestamp, then
 * provider threadUpdatedAt, then lastSyncedAt. Returns 0 when unknown.
 */
export function threadRecentMessageAt(thread: GroupableThread): number {
  let latestActivity: number | null = null;
  for (const item of thread.sourceActivity ?? []) {
    const ms = toMillis(item.timestamp);
    if (ms == null) continue;
    if (latestActivity == null || ms > latestActivity) latestActivity = ms;
  }
  return (
    latestActivity ??
    toMillis(thread.threadUpdatedAt) ??
    toMillis(thread.lastSyncedAt) ??
    0
  );
}

function byRecentDesc(a: number, b: number): number {
  return b - a;
}

function agentGroupRecentAt(group: ThreadAgentGroup): number {
  return Math.max(
    0,
    ...group.threads.map((thread) => threadRecentMessageAt(thread)),
  );
}

function ownerGroupRecentAt(group: ThreadOwnerGroup): number {
  return Math.max(0, ...group.agents.map((agent) => agentGroupRecentAt(agent)));
}

function sortAgentGroups(agents: ThreadAgentGroup[]): ThreadAgentGroup[] {
  const sorted = agents.map((group) => ({
    agent: group.agent,
    threads: [...group.threads].sort((a, b) =>
      byRecentDesc(threadRecentMessageAt(a), threadRecentMessageAt(b)),
    ),
  }));
  sorted.sort((a, b) =>
    byRecentDesc(agentGroupRecentAt(a), agentGroupRecentAt(b)),
  );
  return sorted;
}

/** Most recent message across every thread in a project group. */
export function projectRecentMessageAt(group: ThreadProjectGroup): number {
  return Math.max(0, ...group.owners.map((owner) => ownerGroupRecentAt(owner)));
}

/**
 * Group threads by source project, then owner of the source, then agent.
 * Threads and groups are ordered by most recent message (newest first).
 */
export function groupThreadsByProjectAndAgent(
  threads: GroupableThread[],
  catalog: SourceCatalogEntry[] = [],
): ThreadProjectGroup[] {
  const byProject = new Map<
    string,
    Map<string, Map<string, GroupableThread[]>>
  >();

  for (const thread of threads) {
    const projectLabel =
      resolveSourceProjectLabel(thread.projectContext, catalog) ??
      UNGROUPED_SOURCE_PROJECT_LABEL;
    const ownerUserId = thread.ownerUserId.trim() || "unknown";
    const agent = thread.lastAgentName.trim() || "Unknown agent";

    let byOwner = byProject.get(projectLabel);
    if (!byOwner) {
      byOwner = new Map();
      byProject.set(projectLabel, byOwner);
    }
    let byAgent = byOwner.get(ownerUserId);
    if (!byAgent) {
      byAgent = new Map();
      byOwner.set(ownerUserId, byAgent);
    }
    const bucket = byAgent.get(agent);
    if (bucket) bucket.push(thread);
    else byAgent.set(agent, [thread]);
  }

  const groups: ThreadProjectGroup[] = Array.from(byProject.entries()).map(
    ([projectLabel, byOwner]) => {
      const owners: ThreadOwnerGroup[] = Array.from(byOwner.entries()).map(
        ([ownerUserId, byAgent]) => ({
          ownerUserId,
          agents: sortAgentGroups(
            Array.from(byAgent.entries()).map(([agent, agentThreads]) => ({
              agent,
              threads: agentThreads,
            })),
          ),
        }),
      );

      owners.sort((a, b) =>
        byRecentDesc(ownerGroupRecentAt(a), ownerGroupRecentAt(b)),
      );

      return { projectLabel, owners };
    },
  );

  groups.sort((a, b) =>
    byRecentDesc(projectRecentMessageAt(a), projectRecentMessageAt(b)),
  );

  return groups;
}
