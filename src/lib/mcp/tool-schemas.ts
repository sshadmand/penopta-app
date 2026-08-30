/**
 * Shared MCP tool annotations + output schemas for OpenAI plugin review.
 * Annotations drive ChatGPT approval UX; outputSchema + structuredContent
 * let hosts validate and parse tool results.
 */
import { z } from "zod";

/** Read-only tools that never mutate Penopta state. */
export const readAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
} as const;

/**
 * Tools that write (catalog upserts, sync ingest, verify stamps, skill
 * sightings). Marked destructive for Claude Connectors Directory review:
 * any tool that modifies data must set destructiveHint so hosts prompt.
 */
export const writeAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  openWorldHint: false,
} as const;

export const skillStatusSchema = z.object({
  reported: z.number().nullable(),
  current: z.number(),
  minCompat: z.number(),
  stale: z.boolean(),
  compat: z.enum(["ok", "warn", "block"]),
  updateHint: z.string().nullable(),
});

export const mcpProjectSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  summary: z.string(),
  visibility: z.enum(["public", "private"]),
  updatedAt: z.string(),
});

export const mcpThreadSummarySchema = z.object({
  threadId: z.string(),
  externalThreadId: z.string(),
  title: z.string(),
  kind: z.string(),
  status: z.string(),
  agent: z.string(),
  lastSyncedAt: z.string(),
  objective: z.string().nullable(),
  statusSummary: z.string().nullable(),
  nextAction: z.string().nullable(),
  openQuestions: z.array(z.string()),
});

export const mcpThreadDetailSchema = mcpThreadSummarySchema.extend({
  projectContext: z.string().nullable(),
  decisions: z.array(z.string()),
  completedWork: z.array(z.string()),
  artifacts: z.array(z.string()),
  activity: z.array(
    z.object({
      timestamp: z.string().nullable(),
      role: z.string(),
      text: z.string(),
      exact: z.boolean(),
    }),
  ),
});

export const mcpProjectContextSchema = z.object({
  project: mcpProjectSchema,
  threadCount: z.number(),
  threads: z.array(mcpThreadSummarySchema),
  continueWork: z
    .object({
      text: z.string(),
      postedAt: z.string(),
    })
    .nullable(),
});

export const availableProviderProjectSchema = z.object({
  id: z.string(),
  provider: z.enum(["chatgpt", "claude", "cursor"]),
  projectId: z.string(),
  name: z.string(),
  createdAt: z.string().nullable(),
  source: z.enum(["penopta_sync", "penopta_sync_linux", "skill"]).nullable(),
  tracked: z.boolean(),
  sidebarHidden: z.boolean().optional(),
});

export const verifyOutputSchema = z.object({
  ok: z.literal(true),
  server: z.literal("penopta"),
  message: z.string(),
  agent: z.string().nullable(),
  ownerUserId: z.string(),
  orgId: z.string(),
  verifiedAt: z.string(),
});

export const diagnoseOutputSchema = z.object({
  ok: z.literal(true),
  server: z.literal("penopta"),
  message: z.string(),
  agent: z.string().nullable(),
  ownerUserId: z.string(),
  orgId: z.string(),
  expectedTools: z.array(z.string()),
  health: z.object({
    checkedAt: z.string(),
    skillVersionCurrent: z.number(),
    auth: z.object({
      refreshValid: z.boolean(),
      accessValid: z.boolean(),
      accessExpiresAt: z.string().nullable(),
      refreshExpiresAt: z.string().nullable(),
      connectionCount: z.number(),
    }),
    lastVerify: z
      .object({
        verifiedAt: z.string(),
        agent: z.string().nullable(),
      })
      .nullable(),
    recentSyncs: z.array(
      z.object({
        runId: z.string(),
        agentName: z.string(),
        createdAt: z.string(),
        windowEnd: z.string(),
        threadsChanged: z.number(),
        enumerationAvailable: z.boolean().nullable(),
        transcriptsAvailable: z.boolean().nullable(),
        limitation: z.string().nullable(),
      }),
    ),
    status: z.enum([
      "never_connected",
      "needs_reauth",
      "access_expired_refresh_ok",
      "auth_ok_never_verified",
      "auth_ok",
    ]),
    summary: z.string(),
  }),
});

export const listProjectsOutputSchema = z.object({
  projects: z.array(mcpProjectSchema),
});

const mcpStatsEffortRowSchema = z.object({
  key: z.string(),
  label: z.string(),
  days: z.number(),
  tokens: z.number(),
  threads: z.number(),
  prompts: z.number(),
  firstDay: z.string(),
  lastDay: z.string(),
  namedTokens: z.number(),
  inheritedTokens: z.number(),
  agents: z.array(z.string()),
});

const mcpStatsFilterOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
});

export const statsOutputSchema = z.object({
  range: z.enum(["1d", "3d", "1w", "1m", "3m", "6m", "1y"]),
  timezone: z.string(),
  sinceDay: z.string(),
  untilDay: z.string(),
  person: z.object({
    id: z.string(),
    label: z.string(),
  }),
  agent: z
    .object({
      id: z.string(),
      label: z.string(),
    })
    .nullable(),
  project: z
    .object({
      id: z.string(),
      label: z.string(),
      kind: z.enum(["penopta", "source"]),
    })
    .nullable(),
  overview: z.object({
    sessions: z.number(),
    messages: z.number(),
    tokens: z.number(),
    activeDays: z.number(),
    currentStreak: z.number(),
    longestStreak: z.number(),
    peakHour: z.number().nullable(),
    peakHourLabel: z.string().nullable(),
    tokensPerDay: z.number(),
  }),
  effort: z.object({
    plans: z.array(mcpStatsEffortRowSchema).optional(),
    features: z.array(mcpStatsEffortRowSchema).optional(),
    projects: z.array(mcpStatsEffortRowSchema).optional(),
    sources: z.array(mcpStatsEffortRowSchema).optional(),
    agents: z.array(mcpStatsEffortRowSchema).optional(),
    people: z.array(mcpStatsEffortRowSchema).optional(),
  }),
  busiestDays: z.array(
    z.object({
      day: z.string(),
      tokens: z.number(),
      turns: z.number(),
      prompts: z.number(),
    }),
  ),
  available: z.object({
    people: z.array(mcpStatsFilterOptionSchema),
    agents: z.array(mcpStatsFilterOptionSchema),
    projects: z.array(mcpStatsFilterOptionSchema),
  }),
  url: z.string(),
  notes: z.array(z.string()),
});

export const searchThreadsOutputSchema = z.object({
  threads: z.array(
    mcpThreadSummarySchema.extend({
      snippet: z.string(),
    }),
  ),
});

export const knownProjectsOutputSchema = z.object({
  provider: z.enum(["chatgpt", "claude", "cursor"]),
  projects: z.array(availableProviderProjectSchema),
  skill: skillStatusSchema,
});

export const makeProjectsAvailableOutputSchema = z.object({
  ok: z.literal(true),
  provider: z.enum(["chatgpt", "claude", "cursor"]),
  inserted: z.number(),
  updated: z.number(),
  skippedPrivate: z.number(),
  projects: z.array(availableProviderProjectSchema),
  skill: skillStatusSchema,
});

export const trackedProjectsOutputSchema = knownProjectsOutputSchema;

export const syncThreadsOutputSchema = z.object({
  ok: z.literal(true),
  runId: z.string(),
  syncRunId: z.string(),
  threadsUpserted: z.number().optional(),
  duplicate: z.boolean().optional(),
  checkpoint: z.string(),
  cursor: z.string(),
  skill: skillStatusSchema.optional(),
});

export const trackThreadOutputSchema = z.object({
  ok: z.literal(true),
  tracked: z.literal(true),
  duplicate: z.boolean().optional(),
  runId: z.string(),
  syncRunId: z.string(),
  externalThreadId: z.string(),
  threadId: z.string().nullable(),
  title: z.string(),
  url: z.string().nullable(),
  skill: skillStatusSchema.optional(),
});

export const searchOutputSchema = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      url: z.string(),
    }),
  ),
});

export const fetchOutputSchema = z.object({
  id: z.string(),
  title: z.string(),
  text: z.string(),
  url: z.string(),
  metadata: z.object({
    kind: z.string(),
    status: z.string(),
    agent: z.string(),
    lastSyncedAt: z.string(),
  }),
});
