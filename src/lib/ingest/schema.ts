import { z } from "zod";

const isoDateTime = z.string().datetime({ offset: true });
const isoDateTimeOrNull = z.union([isoDateTime, z.null()]);

export const sourceActivitySchema = z.object({
  timestamp: isoDateTimeOrNull,
  role: z.string().min(1),
  text: z.string(),
  isExact: z.boolean(),
});

export const workingStateSchema = z.object({
  objective: z.string(),
  statusSummary: z.string(),
  decisions: z.array(z.string()),
  completedWork: z.array(z.string()),
  artifacts: z.array(z.string()),
  openQuestions: z.array(z.string()),
  nextAction: z.string(),
});

export const threadPayloadSchema = z.object({
  threadId: z.string().min(1),
  title: z.string(),
  kind: z.string().min(1),
  status: z.string().min(1),
  createdAt: isoDateTimeOrNull,
  updatedAt: isoDateTimeOrNull,
  /** Preferred: name of the provider project this thread belongs to. */
  projectName: z.string().min(1).optional(),
  /** Legacy alias for projectName; still accepted from older skill payloads. */
  projectContext: z.union([z.string(), z.null()]).optional(),
  sourceActivity: z.array(sourceActivitySchema),
  workingState: workingStateSchema,
});

export const agentMetaSchema = z.object({
  name: z.string().min(1),
  model: z.string().min(1),
  effort: z.string().min(1).optional(),
});

export const agentSyncPayloadSchema = z.object({
  schemaVersion: z.string().min(1),
  /**
   * Version of the pasteable hourly sync skill the agent is following.
   * Optional during rollout; omit from non-skill producers (e.g. macOS app).
   * Distinct from schemaVersion (JSON contract).
   */
  skillVersion: z.number().int().positive().optional(),
  agentId: z.string().min(1),
  // Optional. Identity is resolved from the Bearer key; when present this must
  // match the key owner. Agents that only hold the key can omit it.
  penopta_user_id: z.string().min(1).optional(),
  runId: z.string().min(1),
  windowStart: isoDateTime,
  windowEnd: isoDateTime,
  agent: agentMetaSchema,
  captureCoverage: z.object({
    enumerationAvailable: z.boolean(),
    transcriptsAvailable: z.boolean(),
    limitation: z.union([z.string(), z.null()]),
  }),
  threads: z.array(threadPayloadSchema),
  runSummary: z.object({
    threadsReviewed: z.number().int().nonnegative(),
    threadsChanged: z.number().int().nonnegative(),
    threadsUnavailable: z.number().int().nonnegative(),
    importantUpdates: z.array(z.string()),
  }),
});

export type AgentSyncPayload = z.infer<typeof agentSyncPayloadSchema>;

/**
 * On-demand single-thread push via MCP `penopta_track_thread`.
 * Wraps into a one-thread agent-sync run server-side.
 */
export const trackThreadPayloadSchema = z.object({
  thread: threadPayloadSchema.describe(
    "The conversation to push: stable threadId, title, transcript " +
      "(sourceActivity), and workingState handoff.",
  ),
  agent: agentMetaSchema.describe(
    'Producing agent, e.g. { name: "claude", model: "claude-opus-4-8" }.',
  ),
  /** Optional idempotency key; generated when omitted. */
  runId: z
    .string()
    .min(1)
    .optional()
    .describe("Optional idempotency key. Omit to auto-generate."),
  /**
   * Optional. Pass when following the Penopta sync skill so Penopta can detect
   * stale pasted instructions. Not required for ad-hoc live-chat tracking.
   */
  skillVersion: z.number().int().positive().optional(),
});

export type TrackThreadPayload = z.infer<typeof trackThreadPayloadSchema>;

/** Agent id stamped on sync runs created by penopta_track_thread. */
export const TRACK_THREAD_AGENT_ID = "penopta-track-thread";

/** Build a one-thread ingest payload from a track-thread request. */
export function toTrackThreadSyncPayload(
  input: TrackThreadPayload,
  now: Date = new Date(),
): AgentSyncPayload {
  const windowEnd = now.toISOString();
  const windowStart =
    input.thread.updatedAt ?? input.thread.createdAt ?? windowEnd;
  return {
    schemaVersion: "1.0",
    ...(input.skillVersion !== undefined
      ? { skillVersion: input.skillVersion }
      : {}),
    agentId: TRACK_THREAD_AGENT_ID,
    runId:
      input.runId ??
      `track-${input.thread.threadId}-${now.getTime().toString(36)}`,
    windowStart,
    windowEnd,
    agent: input.agent,
    captureCoverage: {
      enumerationAvailable: true,
      transcriptsAvailable: true,
      limitation: null,
    },
    threads: [input.thread],
    runSummary: {
      threadsReviewed: 1,
      threadsChanged: 1,
      threadsUnavailable: 0,
      importantUpdates: [],
    },
  };
}
