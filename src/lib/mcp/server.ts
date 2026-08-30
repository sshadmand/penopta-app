import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import {
  catalogProviderForAgent,
  ensureCatalogFromAgentThreads,
  listKnownProviderProjects,
  listTrackedProviderProjects,
  makeProviderProjectsAvailable,
} from "@/lib/integrations/provider-projects-data";
import {
  PROVIDER_PROJECT_PROVIDERS,
  type ProviderProjectProvider,
} from "@/lib/integrations/provider-projects";
import {
  getMcpConnectionHealth,
  PENOPTA_MCP_TOOL_NAMES,
} from "@/lib/integrations/diagnose";
import { getPublicAppUrl } from "@/lib/integrations/providers";
import {
  evaluateSkillVersion,
  HOURLY_SYNC_AGENT_ID,
  skillVersionFieldDescription,
  type SkillStatus,
} from "@/lib/integrations/skill-version";
import { recordSyncSkillSighting } from "@/lib/integrations/skill-sightings";
import {
  DuplicateRunError,
  ingestAgentSync,
  isPrivateProjectName,
  isPrivateThreadTitle,
  resolveThreadProjectName,
} from "@/lib/ingest/data";
import {
  agentSyncPayloadSchema,
  toTrackThreadSyncPayload,
  trackThreadPayloadSchema,
} from "@/lib/ingest/schema";
import type { ApiKeyOwner } from "@/lib/keys/data";
import {
  mcpGetProjectContext,
  mcpGetThread,
  mcpListProjects,
  mcpSearchThreads,
} from "@/lib/mcp/data";
import { mcpGetStats } from "@/lib/mcp/stats";
import {
  diagnoseOutputSchema,
  fetchOutputSchema,
  knownProjectsOutputSchema,
  listProjectsOutputSchema,
  makeProjectsAvailableOutputSchema,
  mcpProjectContextSchema,
  mcpThreadDetailSchema,
  readAnnotations,
  searchOutputSchema,
  searchThreadsOutputSchema,
  statsOutputSchema,
  syncThreadsOutputSchema,
  trackThreadOutputSchema,
  trackedProjectsOutputSchema,
  verifyOutputSchema,
  writeAnnotations,
} from "@/lib/mcp/tool-schemas";
import {
  markLatestUserTokenVerified,
  markTokenVerified,
} from "@/lib/oauth/tokens";
import { getAgentThreadByExternalId } from "@/lib/threads/data";

const providerSchema = z.enum(PROVIDER_PROJECT_PROVIDERS);

const skillVersionInput = z
  .number()
  .int()
  .positive()
  .optional()
  .describe(skillVersionFieldDescription);

/**
 * Tool result with text content (for the model) and structuredContent
 * (validated against the tool's outputSchema).
 */
function jsonResult(value: object) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: value as Record<string, unknown>,
  };
}

/** A tool result flagged as an error (e.g. not found). */
function errorResult(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}

/** Public URL for a thread, used as the citation link in `fetch`. */
function threadUrl(threadId: string): string {
  return `${getPublicAppUrl()}/threads/${threadId}`;
}

/** Attach skill freshness to sync-related tool replies. */
function withSkill<T extends Record<string, unknown>>(
  value: T,
  reported: number | null | undefined,
): T & { skill: SkillStatus } {
  return { ...value, skill: evaluateSkillVersion(reported) };
}

/** Persist a verification stamp for OAuth or API-key MCP sessions. */
async function stampVerified(
  owner: ApiKeyOwner,
  accessTokenHash: string | undefined,
  agent: string | null | undefined,
): Promise<void> {
  if (accessTokenHash) {
    await markTokenVerified(accessTokenHash, agent ?? null);
    return;
  }
  await markLatestUserTokenVerified(owner.ownerUserId, agent ?? null);
}

/** Persist a skill-version sighting; never fail the tool call on write errors. */
async function rememberSkillSighting(
  orgId: string,
  provider: ProviderProjectProvider,
  reported: number | null | undefined,
): Promise<void> {
  try {
    await recordSyncSkillSighting(orgId, provider, reported);
  } catch (err) {
    console.error("mcp recordSyncSkillSighting", err);
  }
}

/**
 * Register Penopta's read tools on an MCP server, scoped to the org the API key
 * belongs to. Called per request with a freshly resolved key owner.
 */
export function buildPenoptaMcpServer(
  server: McpServer,
  owner: ApiKeyOwner,
  accessTokenHash?: string,
): void {
  server.registerTool(
    "penopta_verify",
    {
      title: "Verify Penopta connection",
      description:
        "Confirm that the Penopta MCP server is installed and reachable. Needs no " +
        "other tools first. A successful result means the connection is " +
        "authenticated and working; it echoes the connected user and org so you " +
        "can confirm you're pointed at the right account. Pass `agent` with your " +
        'own name (e.g. "claude", "chatgpt", "cursor") so the verification is ' +
        "attributed to the right client. Call this when the user asks whether the " +
        "Penopta tool/connector is set up correctly.",
      inputSchema: z.object({
        agent: z
          .string()
          .min(1)
          .optional()
          .describe(
            'The agent/client running this check, e.g. "claude", "chatgpt", "cursor".',
          ),
      }),
      outputSchema: verifyOutputSchema,
      annotations: writeAnnotations,
    },
    async ({ agent }) => {
      await stampVerified(owner, accessTokenHash, agent);
      return jsonResult({
        ok: true,
        server: "penopta",
        message: "Penopta MCP connection is installed and authenticated.",
        agent: agent ?? null,
        ownerUserId: owner.ownerUserId,
        orgId: owner.orgId,
        verifiedAt: new Date().toISOString(),
      });
    },
  );

  server.registerTool(
    "penopta_diagnose",
    {
      title: "Diagnose Penopta connection",
      description:
        "Return a structured health report for this Penopta MCP connection: OAuth " +
        "token status, last verify, recent hourly sync deliveries, expected tool " +
        "names, and a short triage summary. Use when the user is debugging a " +
        "failed sync, missing tools, or auth — prefer this over guessing. Pass " +
        '`agent` with your client name (e.g. "chatgpt", "claude").',
      inputSchema: z.object({
        agent: z
          .string()
          .min(1)
          .optional()
          .describe(
            'The agent/client running this check, e.g. "claude", "chatgpt", "cursor".',
          ),
      }),
      outputSchema: diagnoseOutputSchema,
      annotations: writeAnnotations,
    },
    async ({ agent }) => {
      await stampVerified(owner, accessTokenHash, agent);
      const health = await getMcpConnectionHealth(
        owner.ownerUserId,
        owner.orgId,
        { agentName: agent ?? undefined },
      );
      return jsonResult({
        ok: true,
        server: "penopta",
        message:
          "Penopta MCP is reachable and authenticated in this session. Compare this with any client-side report that tools are missing — if you can call this tool, the connector is loaded here.",
        agent: agent ?? null,
        ownerUserId: owner.ownerUserId,
        orgId: owner.orgId,
        expectedTools: [...PENOPTA_MCP_TOOL_NAMES],
        health,
      });
    },
  );

  server.registerTool(
    "penopta_list_projects",
    {
      title: "List workgroups",
      description:
        "Penopta: list the workgroups you can see, with their ids and summaries. " +
        "Start here to find the workgroup a question is about, then call " +
        "penopta_get_project_context with the id or slug.",
      inputSchema: z.object({
        query: z
          .string()
          .optional()
          .describe(
            "Optional text to filter workgroups by name, summary, or slug.",
          ),
      }),
      outputSchema: listProjectsOutputSchema,
      annotations: readAnnotations,
    },
    async ({ query }) =>
      jsonResult({ projects: await mcpListProjects(owner, query) }),
  );

  server.registerTool(
    "penopta_get_project_context",
    {
      title: "Get workgroup context",
      description:
        "Penopta: return a workgroup plus condensed context from every conversation " +
        "thread linked to it (objectives, status summaries, next actions, open " +
        "questions), and the latest continue-work brief when one exists — the " +
        "human's current objectives and the next prompt to pick up while they " +
        "are away. Use this to ground an answer in what has actually happened " +
        "in the workgroup, and to continue unfinished work.",
      inputSchema: z.object({
        project: z
          .string()
          .describe(
            "Workgroup id (UUID) or slug, as returned by penopta_list_projects.",
          ),
      }),
      outputSchema: mcpProjectContextSchema,
      annotations: readAnnotations,
    },
    async ({ project }) => {
      const context = await mcpGetProjectContext(owner, project);
      if (!context)
        return errorResult(`No visible workgroup matching "${project}".`);
      return jsonResult(context);
    },
  );

  server.registerTool(
    "penopta_search_threads",
    {
      title: "Search Penopta threads",
      description:
        "Penopta: search conversation threads by keywords, optionally scoped to " +
        "one workgroup. Returns matching threads with a snippet and their internal " +
        "thread ids; follow up with penopta_get_thread for full detail.",
      inputSchema: z.object({
        query: z.string().describe("Keywords to search for."),
        project: z
          .string()
          .optional()
          .describe("Optional workgroup id or slug to limit the search to."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe("Max results to return (default 20)."),
      }),
      outputSchema: searchThreadsOutputSchema,
      annotations: readAnnotations,
    },
    async ({ query, project, limit }) =>
      jsonResult({
        threads: await mcpSearchThreads(owner, query, {
          projectRef: project,
          limit,
        }),
      }),
  );

  server.registerTool(
    "penopta_get_thread",
    {
      title: "Get Penopta thread",
      description:
        "Penopta: return the full detail of a single thread by its internal id: " +
        "working state (decisions, completed work, artifacts, open questions) " +
        "and the activity log (human turns and final agent replies; lead-up omitted).",
      inputSchema: z.object({
        thread_id: z
          .string()
          .describe(
            "Internal thread id (the threadId field from other tools).",
          ),
      }),
      outputSchema: mcpThreadDetailSchema,
      annotations: readAnnotations,
    },
    async ({ thread_id }) => {
      const thread = await mcpGetThread(owner, thread_id);
      if (!thread) return errorResult(`No thread found for id "${thread_id}".`);
      return jsonResult(thread);
    },
  );

  server.registerTool(
    "penopta_get_stats",
    {
      title: "Get Penopta activity stats",
      description:
        "Penopta: return activity stats for the connected workspace — estimated " +
        "tokens, sessions, streaks, busiest days, and effort broken down by plan, " +
        "feature, workgroup, source project, agent, and person. Use when the " +
        "user asks how much they (or the team) have been working, token usage, " +
        "effort by workgroup/plan/agent, or for a stats/heatmap summary. Defaults to " +
        'the connected user over the last 6 months. Pass person="all" for the ' +
        "whole org. Tokens are estimated from captured transcripts (o200k_base), " +
        "not provider billing.",
      inputSchema: z.object({
        range: z
          .enum(["1d", "3d", "1w", "1m", "3m", "6m", "1y"])
          .optional()
          .describe("Lookback ending today. Default 6m."),
        person: z
          .string()
          .optional()
          .describe(
            'Whose stats: "me" (default), "all" for the org, or a person name/id.',
          ),
        agent: z
          .string()
          .optional()
          .describe("Optional agent name (e.g. cursor, claude, chatgpt)."),
        project: z
          .string()
          .optional()
          .describe(
            "Optional workgroup id/slug/name, or a source (provider) project name.",
          ),
        timezone: z
          .string()
          .optional()
          .describe(
            "IANA timezone for calendar days (e.g. America/Los_Angeles). Default UTC.",
          ),
        lens: z
          .enum([
            "all",
            "plans",
            "features",
            "projects",
            "sources",
            "agents",
            "people",
          ])
          .optional()
          .describe("Which effort breakdown to include. Default all."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(25)
          .optional()
          .describe("Max rows per effort breakdown (default 12)."),
      }),
      outputSchema: statsOutputSchema,
      annotations: readAnnotations,
    },
    async (input) => {
      const result = await mcpGetStats(owner, input);
      if (!result.ok) return errorResult(result.error);
      return jsonResult(result.stats);
    },
  );

  server.registerTool(
    "known_projects",
    {
      title: "Known provider projects",
      description:
        "List provider projects Penopta already has in its available catalog " +
        "for chatgpt, claude, or cursor. Call this during sync discovery, then push only " +
        "unknown projects via make_projects_available. Returns metadata only " +
        "(projectId, name, createdAt, tracked, private) — no transcripts. " +
        "Pass skillVersion from the pasted sync skill so Penopta can detect " +
        "outdated schedule instructions.",
      inputSchema: z.object({
        provider: providerSchema.describe(
          'Which provider catalog to read: "chatgpt", "claude", or "cursor".',
        ),
        skillVersion: skillVersionInput,
      }),
      outputSchema: knownProjectsOutputSchema,
      // Records a skill sighting — not a pure read.
      annotations: writeAnnotations,
    },
    async ({ provider, skillVersion }) => {
      await rememberSkillSighting(owner.orgId, provider, skillVersion);
      return jsonResult(
        withSkill(
          {
            provider,
            projects: await listKnownProviderProjects(owner.orgId, provider),
          },
          skillVersion,
        ),
      );
    },
  );

  server.registerTool(
    "make_projects_available",
    {
      title: "Make provider projects available",
      description:
        "Register unknown provider projects in Penopta's available catalog. " +
        "Send metadata only: projectId (stable provider id), name, and optional " +
        "createdAt. Do not send transcripts. Upserts by projectId; does not " +
        "change tracking. Never include projects whose names start with p: or " +
        "private: (case-insensitive) — those are skipped and not stored. " +
        "Pass skillVersion from the pasted sync skill.",
      inputSchema: z.object({
        provider: providerSchema.describe(
          'Which provider these projects come from: "chatgpt", "claude", or "cursor".',
        ),
        skillVersion: skillVersionInput,
        projects: z
          .array(
            z.object({
              projectId: z
                .string()
                .min(1)
                .describe(
                  "Stable provider project id used later to list threads in the project.",
                ),
              name: z.string().min(1).describe("Display name of the project."),
              createdAt: z
                .string()
                .nullable()
                .optional()
                .describe(
                  "ISO-8601 created time if known, otherwise omit/null.",
                ),
            }),
          )
          .min(1)
          .describe("Unknown projects to add or refresh in the catalog."),
      }),
      outputSchema: makeProjectsAvailableOutputSchema,
      annotations: writeAnnotations,
    },
    async ({ provider, skillVersion, projects }) => {
      await rememberSkillSighting(owner.orgId, provider, skillVersion);
      const result = await makeProviderProjectsAvailable(
        owner.ownerUserId,
        owner.orgId,
        provider,
        projects.map((p) => ({ ...p, source: "skill" as const })),
      );
      return jsonResult(
        withSkill(
          {
            ok: true as const,
            provider,
            inserted: result.inserted,
            updated: result.updated,
            skippedPrivate: result.skippedPrivate,
            projects: result.projects,
          },
          skillVersion,
        ),
      );
    },
  );

  server.registerTool(
    "tracked_projects",
    {
      title: "Tracked provider projects",
      description:
        "Return the provider projects the user opted to track for transcript " +
        "sync. Sync only threads that belong to these projects. Private-prefixed " +
        "projects are never included or stored. Pass skillVersion from the " +
        "pasted sync skill.",
      inputSchema: z.object({
        provider: providerSchema.describe(
          'Which provider catalog to read: "chatgpt", "claude", or "cursor".',
        ),
        skillVersion: skillVersionInput,
      }),
      outputSchema: trackedProjectsOutputSchema,
      annotations: writeAnnotations,
    },
    async ({ provider, skillVersion }) => {
      await rememberSkillSighting(owner.orgId, provider, skillVersion);
      return jsonResult(
        withSkill(
          {
            provider,
            projects: await listTrackedProviderProjects(owner.orgId, provider),
          },
          skillVersion,
        ),
      );
    },
  );

  server.registerTool(
    "sync_threads",
    {
      title: "Sync threads",
      description:
        "Deliver a windowed thread-context sync to Penopta. Prefer this over the " +
        "curl/HTTP endpoint: identity and target org are taken from your " +
        "authenticated connection, so no API key or bearer token is needed and " +
        "none should be included in the payload. Send the same JSON described in " +
        "the sync skill (schemaVersion, skillVersion, runId, window, agent, " +
        "captureCoverage, threads, runSummary). Only include threads from " +
        "projects returned by tracked_projects. Runs are idempotent by runId. " +
        "On success it returns { ok: true, checkpoint, skill }; treat skill.compat " +
        '"block" / error skill_outdated as a failed delivery.',
      inputSchema: agentSyncPayloadSchema,
      outputSchema: syncThreadsOutputSchema,
      annotations: writeAnnotations,
    },
    async (payload) => {
      if (
        payload.penopta_user_id &&
        payload.penopta_user_id !== owner.ownerUserId
      ) {
        return errorResult(
          "penopta_user_id does not match the authenticated user. Omit it — " +
            "identity is resolved from your connection.",
        );
      }

      // Skill freshness applies to the hourly pasted skill (and any caller that
      // reports skillVersion). macOS / other HTTP producers omit both and skip.
      const checkSkill =
        payload.skillVersion !== undefined ||
        payload.agentId === HOURLY_SYNC_AGENT_ID;
      const skill = checkSkill
        ? evaluateSkillVersion(payload.skillVersion)
        : null;
      const catalogProvider = catalogProviderForAgent({
        agentName: payload.agent.name,
        kind: payload.threads[0]?.kind,
      });
      if (checkSkill && catalogProvider) {
        await rememberSkillSighting(
          owner.orgId,
          catalogProvider,
          payload.skillVersion,
        );
      }
      if (skill?.compat === "block") {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  ok: false,
                  error: "skill_outdated",
                  skill,
                },
                null,
                2,
              ),
            },
          ],
          isError: true,
        };
      }

      try {
        const { run, threadsUpserted } = await ingestAgentSync(
          owner.ownerUserId,
          owner.orgId,
          payload,
        );
        if (catalogProvider) {
          await ensureCatalogFromAgentThreads(
            owner.ownerUserId,
            owner.orgId,
            catalogProvider,
          );
        }
        const checkpoint = run.windowEnd.toISOString();
        return jsonResult({
          ok: true,
          runId: run.runId,
          syncRunId: run.id,
          threadsUpserted,
          checkpoint,
          cursor: checkpoint,
          ...(skill ? { skill } : {}),
        });
      } catch (err) {
        if (err instanceof DuplicateRunError) {
          const checkpoint = err.existing.windowEnd.toISOString();
          return jsonResult({
            ok: true,
            runId: err.existing.runId,
            syncRunId: err.existing.id,
            duplicate: true,
            checkpoint,
            cursor: checkpoint,
            ...(skill ? { skill } : {}),
          });
        }
        console.error("mcp sync_threads", err);
        return errorResult("Failed to ingest sync payload.");
      }
    },
  );

  server.registerTool(
    "penopta_track_thread",
    {
      title: "Track thread",
      description:
        "Push a single conversation thread into Penopta for later use " +
        "(search, project context, handoffs). Call this when the user asks to " +
        "track, save, or sync this chat — including standalone chats outside " +
        "tracked projects. Build a concise workingState handoff and include " +
        "exact visible transcript turns in sourceActivity (isExact: true). " +
        "Use a stable provider threadId when known. Never send threads whose " +
        "title (or projectName) starts with P: or Private:. Identity comes " +
        "from your authenticated connection — no API key or penopta_user_id.",
      inputSchema: trackThreadPayloadSchema,
      outputSchema: trackThreadOutputSchema,
      annotations: writeAnnotations,
    },
    async (input) => {
      if (isPrivateThreadTitle(input.thread.title)) {
        return errorResult(
          "This thread title starts with P: or Private: and cannot be tracked.",
        );
      }
      const projectName = resolveThreadProjectName(input.thread);
      if (projectName && isPrivateProjectName(projectName)) {
        return errorResult(
          "This thread belongs to a private-prefixed project and cannot be tracked.",
        );
      }

      const skill =
        input.skillVersion !== undefined
          ? evaluateSkillVersion(input.skillVersion)
          : null;
      if (skill?.compat === "block") {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  ok: false,
                  error: "skill_outdated",
                  skill,
                },
                null,
                2,
              ),
            },
          ],
          isError: true,
        };
      }

      const payload = toTrackThreadSyncPayload(input);
      try {
        const { run, threadsUpserted } = await ingestAgentSync(
          owner.ownerUserId,
          owner.orgId,
          payload,
        );
        if (threadsUpserted === 0) {
          return errorResult(
            "Thread was not stored (private filters). Nothing was tracked.",
          );
        }

        const catalogProvider = catalogProviderForAgent({
          agentName: payload.agent.name,
          kind: input.thread.kind,
        });
        if (catalogProvider) {
          await ensureCatalogFromAgentThreads(
            owner.ownerUserId,
            owner.orgId,
            catalogProvider,
          );
        }

        const stored = await getAgentThreadByExternalId(
          owner.orgId,
          input.thread.threadId,
        );
        const internalId = stored?.id ?? null;
        return jsonResult({
          ok: true,
          tracked: true,
          runId: run.runId,
          syncRunId: run.id,
          externalThreadId: input.thread.threadId,
          threadId: internalId,
          title: input.thread.title,
          url: internalId ? threadUrl(internalId) : null,
          ...(skill ? { skill } : {}),
        });
      } catch (err) {
        if (err instanceof DuplicateRunError) {
          const stored = await getAgentThreadByExternalId(
            owner.orgId,
            input.thread.threadId,
          );
          const internalId = stored?.id ?? null;
          return jsonResult({
            ok: true,
            tracked: true,
            duplicate: true,
            runId: err.existing.runId,
            syncRunId: err.existing.id,
            externalThreadId: input.thread.threadId,
            threadId: internalId,
            title: input.thread.title,
            url: internalId ? threadUrl(internalId) : null,
            ...(skill ? { skill } : {}),
          });
        }
        console.error("mcp penopta_track_thread", err);
        return errorResult("Failed to track thread.");
      }
    },
  );

  // ChatGPT connectors expect tools literally named `search` and `fetch`.
  server.registerTool(
    "search",
    {
      title: "Search",
      description:
        "Search Penopta threads for content relevant to the query. Returns a list " +
        "of results with ids that can be passed to fetch.",
      inputSchema: z.object({
        query: z.string().describe("The search query."),
      }),
      outputSchema: searchOutputSchema,
      annotations: readAnnotations,
    },
    async ({ query }) => {
      const matches = await mcpSearchThreads(owner, query, { limit: 20 });
      const results = matches.map((m) => ({
        id: m.threadId,
        title: m.title,
        url: threadUrl(m.threadId),
      }));
      return jsonResult({ results });
    },
  );

  server.registerTool(
    "fetch",
    {
      title: "Fetch",
      description:
        "Fetch the full text of a single Penopta thread by the id returned from " +
        "search.",
      inputSchema: z.object({
        id: z.string().describe("The thread id returned by search."),
      }),
      outputSchema: fetchOutputSchema,
      annotations: readAnnotations,
    },
    async ({ id }) => {
      const thread = await mcpGetThread(owner, id);
      if (!thread) return errorResult(`No thread found for id "${id}".`);

      const lines: string[] = [];
      if (thread.statusSummary) lines.push(`Status: ${thread.statusSummary}`);
      if (thread.objective) lines.push(`Objective: ${thread.objective}`);
      if (thread.nextAction) lines.push(`Next action: ${thread.nextAction}`);
      if (thread.openQuestions.length)
        lines.push(`Open questions:\n- ${thread.openQuestions.join("\n- ")}`);
      lines.push("");
      lines.push("Conversation:");
      for (const a of thread.activity) {
        const when = a.timestamp ? `[${a.timestamp}] ` : "";
        lines.push(`${when}${a.role}: ${a.text}`);
      }

      return jsonResult({
        id: thread.threadId,
        title: thread.title,
        text: lines.join("\n"),
        url: threadUrl(thread.threadId),
        metadata: {
          kind: thread.kind,
          status: thread.status,
          agent: thread.agent,
          lastSyncedAt: thread.lastSyncedAt,
        },
      });
    },
  );
}
