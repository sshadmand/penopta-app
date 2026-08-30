import { and, desc, eq } from "drizzle-orm";

import { CONTINUE_WORK_META_PREFIX } from "@/lib/ai/continue-project";
import { db } from "@/lib/db/client";
import type { AgentThreadRow, ProjectRow } from "@/lib/db/schema";
import { agentSyncRuns } from "@/lib/db/schema";
import { HOURLY_SYNC_AGENT_ID } from "@/lib/integrations/skill-version";
import {
  listTrackedProviderProjects,
  type AvailableProviderProject,
} from "@/lib/integrations/provider-projects-data";
import type { ProviderProjectProvider } from "@/lib/integrations/provider-projects";
import type { ApiKeyOwner } from "@/lib/keys/data";
import { getLatestAssistantMessageByMetaPrefix } from "@/lib/projects/chat-data";
import { getVisibleProject, listVisibleProjects } from "@/lib/projects/data";
import {
  getAgentThread,
  listAgentThreads,
  listProjectThreads,
} from "@/lib/threads/data";
import { withoutLeadUp } from "@/lib/threads/lead-up";

/** Default lookback when Penopta has no prior skill checkpoint. */
const DEFAULT_LOOKBACK_MS = 60 * 60 * 1000;
/** Overlap before the last checkpoint so boundary updates are not missed. */
const CHECKPOINT_OVERLAP_MS = 5 * 60 * 1000;

/** Compact project shape returned to MCP clients. */
export type McpProject = {
  id: string;
  slug: string;
  name: string;
  summary: string;
  visibility: ProjectRow["visibility"];
  updatedAt: string;
};

/** One thread condensed to what a model needs to reason about a project. */
export type McpThreadSummary = {
  /** Internal id — pass this to `penopta_get_thread` / `fetch`. */
  threadId: string;
  /** Stable id from the producing agent (chatgpt/claude). */
  externalThreadId: string;
  title: string;
  kind: string;
  status: string;
  agent: string;
  lastSyncedAt: string;
  objective: string | null;
  statusSummary: string | null;
  nextAction: string | null;
  openQuestions: string[];
};

/** Full thread detail including the working state and the activity log (lead-up omitted). */
export type McpThreadDetail = McpThreadSummary & {
  projectContext: string | null;
  decisions: string[];
  completedWork: string[];
  artifacts: string[];
  activity: {
    timestamp: string | null;
    role: string;
    text: string;
    /** false when the text is a paraphrase rather than a verbatim quote. */
    exact: boolean;
  }[];
};

function toProject(row: ProjectRow): McpProject {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    summary: row.summary,
    visibility: row.visibility,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toSummary(row: AgentThreadRow): McpThreadSummary {
  const ws = row.workingState;
  return {
    threadId: row.id,
    externalThreadId: row.threadId,
    title: row.title || "Untitled thread",
    kind: row.kind,
    status: row.status,
    agent: row.lastAgentName,
    lastSyncedAt: row.lastSyncedAt.toISOString(),
    objective: ws?.objective || null,
    statusSummary: ws?.statusSummary || null,
    nextAction: ws?.nextAction || null,
    openQuestions: ws?.openQuestions ?? [],
  };
}

function toDetail(row: AgentThreadRow): McpThreadDetail {
  const ws = row.workingState;
  return {
    ...toSummary(row),
    projectContext: row.projectContext,
    decisions: ws?.decisions ?? [],
    completedWork: ws?.completedWork ?? [],
    artifacts: ws?.artifacts ?? [],
    activity: withoutLeadUp(row.sourceActivity).map((item) => ({
      timestamp: item.timestamp,
      role: item.role,
      text: item.text,
      exact: item.isExact,
    })),
  };
}

/** Projects the key owner can see in the key's org (optionally filtered). */
export async function mcpListProjects(
  owner: ApiKeyOwner,
  query?: string,
): Promise<McpProject[]> {
  const rows = await listVisibleProjects({
    orgId: owner.orgId,
    viewerUserId: owner.ownerUserId,
    query,
  });
  return rows.map(toProject);
}

export type McpProjectContext = {
  project: McpProject;
  threadCount: number;
  threads: McpThreadSummary[];
  /** Latest continue-work brief (human objectives + next prompt), if posted. */
  continueWork: {
    text: string;
    postedAt: string;
  } | null;
};

/**
 * A project plus condensed context from every thread linked to it. This is the
 * primary tool a model calls to "supplement" its answer with project history.
 */
export async function mcpGetProjectContext(
  owner: ApiKeyOwner,
  projectRef: string,
): Promise<McpProjectContext | null> {
  const project = await getVisibleProject(
    projectRef,
    owner.orgId,
    owner.ownerUserId,
  );
  if (!project) return null;

  const threads = await listProjectThreads(project.id, owner.orgId);
  const continueMsg = await getLatestAssistantMessageByMetaPrefix(
    project.id,
    owner.orgId,
    CONTINUE_WORK_META_PREFIX,
  );
  return {
    project: toProject(project),
    threadCount: threads.length,
    threads: threads.map(toSummary),
    continueWork: continueMsg
      ? { text: continueMsg.text, postedAt: continueMsg.createdAt }
      : null,
  };
}

/** Build a searchable haystack for a thread. */
function threadHaystack(row: AgentThreadRow): string {
  const ws = row.workingState;
  const parts = [
    row.title,
    row.projectContext ?? "",
    ws?.objective ?? "",
    ws?.statusSummary ?? "",
    ws?.nextAction ?? "",
    ...(ws?.decisions ?? []),
    ...(ws?.openQuestions ?? []),
    ...withoutLeadUp(row.sourceActivity).map((a) => a.text),
  ];
  return parts.join("\n").toLowerCase();
}

/** First activity/summary line that mentions the query, for a preview. */
function threadSnippet(row: AgentThreadRow, needle: string): string {
  const lower = needle.toLowerCase();
  const hit = withoutLeadUp(row.sourceActivity).find((a) =>
    a.text.toLowerCase().includes(lower),
  );
  const text = hit?.text ?? row.workingState?.statusSummary ?? row.title;
  return text.length > 280 ? `${text.slice(0, 277)}…` : text;
}

export type McpThreadMatch = McpThreadSummary & { snippet: string };

/**
 * Substring search across an org's threads, optionally scoped to one project.
 * Ranked by number of query-term hits, most recent first as a tiebreaker.
 */
export async function mcpSearchThreads(
  owner: ApiKeyOwner,
  query: string,
  opts: { projectRef?: string; limit?: number } = {},
): Promise<McpThreadMatch[]> {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);

  let rows: AgentThreadRow[];
  if (opts.projectRef) {
    const project = await getVisibleProject(
      opts.projectRef,
      owner.orgId,
      owner.ownerUserId,
    );
    if (!project) return [];
    rows = await listProjectThreads(project.id, owner.orgId);
  } else {
    // Outside a project, only the caller's own threads are searchable.
    rows = await listAgentThreads(owner.orgId, {
      ownerUserId: owner.ownerUserId,
    });
  }

  const scored = rows
    .map((row) => {
      const hay = threadHaystack(row);
      const score = terms.reduce(
        (acc, term) => (hay.includes(term) ? acc + 1 : acc),
        0,
      );
      return { row, score };
    })
    .filter((s) => (terms.length === 0 ? true : s.score > 0))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.row.lastSyncedAt.getTime() - a.row.lastSyncedAt.getTime();
    });

  const limit = opts.limit ?? 20;
  return scored.slice(0, limit).map(({ row }) => ({
    ...toSummary(row),
    snippet: threadSnippet(row, query),
  }));
}

/** Full detail for a single thread by its internal id, scoped to the org. */
export async function mcpGetThread(
  owner: ApiKeyOwner,
  threadId: string,
): Promise<McpThreadDetail | null> {
  const row = await getAgentThread(owner.orgId, threadId);
  return row ? toDetail(row) : null;
}

export type McpSyncCheckpoint = {
  checkpoint: string | null;
  runId: string | null;
  syncRunId: string | null;
  agentId: string | null;
};

/**
 * Last successful hourly skill checkpoint for this org + provider
 * (`windowEnd` of the newest matching sync run).
 */
export async function mcpGetSkillCheckpoint(
  orgId: string,
  provider: ProviderProjectProvider,
): Promise<McpSyncCheckpoint> {
  const [row] = await db
    .select({
      id: agentSyncRuns.id,
      runId: agentSyncRuns.runId,
      agentId: agentSyncRuns.agentId,
      windowEnd: agentSyncRuns.windowEnd,
    })
    .from(agentSyncRuns)
    .where(
      and(
        eq(agentSyncRuns.orgId, orgId),
        eq(agentSyncRuns.agentId, HOURLY_SYNC_AGENT_ID),
        eq(agentSyncRuns.agentName, provider),
      ),
    )
    .orderBy(desc(agentSyncRuns.windowEnd))
    .limit(1);

  if (!row) {
    return {
      checkpoint: null,
      runId: null,
      syncRunId: null,
      agentId: null,
    };
  }

  return {
    checkpoint: row.windowEnd.toISOString(),
    runId: row.runId,
    syncRunId: row.id,
    agentId: row.agentId,
  };
}

export type McpSyncNowKickoff = {
  ok: true;
  force: true;
  provider: ProviderProjectProvider;
  checkpoint: string | null;
  windowStart: string;
  windowEnd: string;
  overlapMinutes: number;
  lookbackMinutes: number | null;
  trackedProjects: AvailableProviderProject[];
  instructions: string[];
};

/**
 * Kick off an immediate (non-scheduled) sync: return the sync window, tracked
 * projects, and step list so the agent runs discover → gather → sync_threads now.
 */
export async function mcpSyncNow(
  owner: ApiKeyOwner,
  provider: ProviderProjectProvider,
  opts: { lookbackMinutes?: number } = {},
  now: Date = new Date(),
): Promise<McpSyncNowKickoff> {
  const prior = await mcpGetSkillCheckpoint(owner.orgId, provider);
  const trackedProjects = await listTrackedProviderProjects(
    owner.orgId,
    provider,
  );

  const windowEnd = now;
  let windowStart: Date;
  let lookbackMinutes: number | null = null;

  if (
    typeof opts.lookbackMinutes === "number" &&
    Number.isFinite(opts.lookbackMinutes) &&
    opts.lookbackMinutes > 0
  ) {
    lookbackMinutes = Math.floor(opts.lookbackMinutes);
    windowStart = new Date(windowEnd.getTime() - lookbackMinutes * 60_000);
  } else if (prior.checkpoint) {
    windowStart = new Date(
      new Date(prior.checkpoint).getTime() - CHECKPOINT_OVERLAP_MS,
    );
  } else {
    lookbackMinutes = 60;
    windowStart = new Date(windowEnd.getTime() - DEFAULT_LOOKBACK_MS);
  }

  const instructions = [
    "Run the Penopta sync skill now (do not wait for the hourly schedule).",
    `Use provider="${provider}".`,
    "1. Discover: known_projects → make_projects_available for unknowns (metadata only). Skip P:/Private: names.",
    "2. Choose: sync only projects in trackedProjects below (re-call tracked_projects if needed).",
    "3. Gather transcripts updated in windowStart..windowEnd for those tracked projects only.",
    "4. Deliver with sync_threads. Do not use penopta_track_thread for this bulk run.",
    "Identity and org come from this connection — omit API keys, tokens, endpoints, and penopta_user_id.",
  ];

  if (trackedProjects.length === 0) {
    instructions.push(
      "No projects are tracked — still deliver an empty threads payload via sync_threads so the checkpoint advances.",
    );
  }

  return {
    ok: true,
    force: true,
    provider,
    checkpoint: prior.checkpoint,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    overlapMinutes: 5,
    lookbackMinutes,
    trackedProjects,
    instructions,
  };
}
