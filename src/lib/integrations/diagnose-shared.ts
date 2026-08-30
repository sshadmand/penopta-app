/**
 * Client-safe diagnose helpers (no DB). Types + pasteable self-check prompt.
 */

export type McpAuthHealth = {
  /** Any non-revoked row with a still-valid refresh token. */
  refreshValid: boolean;
  /** Any non-revoked row with a still-valid access token. */
  accessValid: boolean;
  /** Latest access expiry among non-revoked tokens (ISO), if any. */
  accessExpiresAt: string | null;
  /** Latest refresh expiry among non-revoked tokens (ISO), if any. */
  refreshExpiresAt: string | null;
  /** Non-revoked token rows for this user. */
  connectionCount: number;
};

export type RecentSyncHealth = {
  runId: string;
  agentName: string;
  createdAt: string;
  windowEnd: string;
  threadsChanged: number;
  enumerationAvailable: boolean | null;
  transcriptsAvailable: boolean | null;
  limitation: string | null;
};

export type McpConnectionHealth = {
  checkedAt: string;
  skillVersionCurrent: number;
  auth: McpAuthHealth;
  lastVerify: {
    verifiedAt: string;
    agent: string | null;
  } | null;
  recentSyncs: RecentSyncHealth[];
  /**
   * Short triage codes for the UI / diagnose tool.
   * - `never_connected` — no OAuth token rows
   * - `needs_reauth` — refresh expired or all revoked
   * - `access_expired_refresh_ok` — client should refresh; if tools missing, it's not refresh
   * - `auth_ok_never_verified` — tokens exist but penopta_verify never ran
   * - `auth_ok` — refresh valid and we've seen a verify
   */
  status:
    | "never_connected"
    | "needs_reauth"
    | "access_expired_refresh_ok"
    | "auth_ok_never_verified"
    | "auth_ok";
  /** One-line explanation for the user. */
  summary: string;
};

/**
 * Expected tool names on the Penopta MCP server. Used by the client self-check
 * prompt and by penopta_diagnose so the agent can compare "what I see" vs "what
 * should exist".
 */
export const PENOPTA_MCP_TOOL_NAMES = [
  "penopta_verify",
  "penopta_diagnose",
  "penopta_list_projects",
  "penopta_get_project_context",
  "penopta_search_threads",
  "penopta_get_thread",
  "penopta_get_stats",
  "known_projects",
  "make_projects_available",
  "tracked_projects",
  "penopta_sync_now",
  "sync_threads",
  "penopta_track_thread",
  "search",
  "fetch",
] as const;

/** Same shape as verify: ask the agent to call the MCP tool. */
export const DIAGNOSE_CHAT_COMMAND = "Run penopta_diagnose tool";

/**
 * Prefill for ChatGPT/Claude. Prefer calling `penopta_diagnose`; if the tool
 * is not callable, the agent should say so (same failure mode as verify).
 */
export function mcpDiagnoseChatPrompt(agentHint?: string): string {
  if (!agentHint) return DIAGNOSE_CHAT_COMMAND;
  return `${DIAGNOSE_CHAT_COMMAND} with agent "${agentHint}"`;
}

/** Open ChatGPT with the diagnose command prefilled. */
export function chatgptDiagnoseHref(): string {
  return `https://chatgpt.com/?q=${encodeURIComponent(mcpDiagnoseChatPrompt("chatgpt"))}`;
}

/** Open Claude with the diagnose command prefilled. */
export function claudeDiagnoseHref(): string {
  return `https://claude.ai/new?q=${encodeURIComponent(mcpDiagnoseChatPrompt("claude"))}`;
}

/** Whether a delivered sync reported capture problems. */
export function syncHasCaptureGap(sync: RecentSyncHealth): boolean {
  return (
    sync.enumerationAvailable === false ||
    sync.transcriptsAvailable === false ||
    Boolean(sync.limitation)
  );
}
