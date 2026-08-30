/**
 * Server-only connection diagnostics (DB reads).
 * Client-safe prompt/types live in `diagnose-shared.ts`.
 */

import { and, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { agentSyncRuns, oauthTokens } from "@/lib/db/schema";
import type {
  McpAuthHealth,
  McpConnectionHealth,
  RecentSyncHealth,
} from "@/lib/integrations/diagnose-shared";
import {
  HOURLY_SYNC_AGENT_ID,
  SYNC_SKILL_VERSION,
} from "@/lib/integrations/skill-version";
import { getLatestMcpVerification } from "@/lib/oauth/tokens";

export type {
  McpAuthHealth,
  McpConnectionHealth,
  RecentSyncHealth,
} from "@/lib/integrations/diagnose-shared";
export {
  chatgptDiagnoseHref,
  claudeDiagnoseHref,
  DIAGNOSE_CHAT_COMMAND,
  mcpDiagnoseChatPrompt,
  PENOPTA_MCP_TOOL_NAMES,
  syncHasCaptureGap,
} from "@/lib/integrations/diagnose-shared";

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

export async function getMcpAuthHealth(userId: string): Promise<McpAuthHealth> {
  const now = new Date();
  const rows = await db
    .select({
      accessTokenExpiresAt: oauthTokens.accessTokenExpiresAt,
      refreshTokenExpiresAt: oauthTokens.refreshTokenExpiresAt,
      revokedAt: oauthTokens.revokedAt,
    })
    .from(oauthTokens)
    .where(and(eq(oauthTokens.userId, userId), isNull(oauthTokens.revokedAt)));

  let accessValid = false;
  let refreshValid = false;
  let accessExpiresAt: Date | null = null;
  let refreshExpiresAt: Date | null = null;

  for (const row of rows) {
    if (row.accessTokenExpiresAt > now) accessValid = true;
    if (row.refreshTokenExpiresAt && row.refreshTokenExpiresAt > now) {
      refreshValid = true;
    }
    if (!accessExpiresAt || row.accessTokenExpiresAt > accessExpiresAt) {
      accessExpiresAt = row.accessTokenExpiresAt;
    }
    if (
      row.refreshTokenExpiresAt &&
      (!refreshExpiresAt || row.refreshTokenExpiresAt > refreshExpiresAt)
    ) {
      refreshExpiresAt = row.refreshTokenExpiresAt;
    }
  }

  return {
    refreshValid,
    accessValid,
    accessExpiresAt: iso(accessExpiresAt),
    refreshExpiresAt: iso(refreshExpiresAt),
    connectionCount: rows.length,
  };
}

export async function listRecentSyncHealth(
  orgId: string,
  opts: { agentName?: string; limit?: number } = {},
): Promise<RecentSyncHealth[]> {
  const limit = opts.limit ?? 5;
  const conditions = [
    eq(agentSyncRuns.orgId, orgId),
    eq(agentSyncRuns.agentId, HOURLY_SYNC_AGENT_ID),
  ];
  if (opts.agentName) {
    conditions.push(eq(agentSyncRuns.agentName, opts.agentName));
  }

  const rows = await db
    .select({
      runId: agentSyncRuns.runId,
      agentName: agentSyncRuns.agentName,
      createdAt: agentSyncRuns.createdAt,
      windowEnd: agentSyncRuns.windowEnd,
      captureCoverage: agentSyncRuns.captureCoverage,
      runSummary: agentSyncRuns.runSummary,
    })
    .from(agentSyncRuns)
    .where(and(...conditions))
    .orderBy(desc(agentSyncRuns.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    runId: row.runId,
    agentName: row.agentName,
    createdAt: row.createdAt.toISOString(),
    windowEnd: row.windowEnd.toISOString(),
    threadsChanged: row.runSummary?.threadsChanged ?? 0,
    enumerationAvailable: row.captureCoverage?.enumerationAvailable ?? null,
    transcriptsAvailable: row.captureCoverage?.transcriptsAvailable ?? null,
    limitation: row.captureCoverage?.limitation ?? null,
  }));
}

function summarize(health: Omit<McpConnectionHealth, "summary">): string {
  switch (health.status) {
    case "never_connected":
      return "Penopta has never issued an MCP OAuth token for this account. Add the connector and complete the sign-in prompt.";
    case "needs_reauth":
      return "MCP refresh token is expired or revoked. Remove and re-add the Penopta connector, then approve sign-in again.";
    case "access_expired_refresh_ok":
      return "Access token expired but refresh is still valid. The client should refresh automatically — if tools are missing, the client did not load the connector into this session (not a Penopta outage).";
    case "auth_ok_never_verified":
      return "OAuth looks valid, but penopta_verify has never been called. Run the verify command in an interactive chat.";
    case "auth_ok":
      return "OAuth is valid and Penopta has seen a successful verify. If a scheduled task still says tools are missing, that runtime did not attach the connector.";
  }
}

export async function getMcpConnectionHealth(
  userId: string,
  orgId: string,
  opts: { agentName?: string } = {},
): Promise<McpConnectionHealth> {
  const [auth, lastVerify, recentSyncs] = await Promise.all([
    getMcpAuthHealth(userId),
    getLatestMcpVerification(userId),
    listRecentSyncHealth(orgId, {
      agentName: opts.agentName,
      limit: 5,
    }),
  ]);

  let status: McpConnectionHealth["status"];
  if (auth.connectionCount === 0) {
    status = "never_connected";
  } else if (!auth.refreshValid) {
    status = "needs_reauth";
  } else if (!auth.accessValid) {
    status = "access_expired_refresh_ok";
  } else if (!lastVerify) {
    status = "auth_ok_never_verified";
  } else {
    status = "auth_ok";
  }

  const base = {
    checkedAt: new Date().toISOString(),
    skillVersionCurrent: SYNC_SKILL_VERSION,
    auth,
    lastVerify: lastVerify
      ? {
          verifiedAt: lastVerify.verifiedAt.toISOString(),
          agent: lastVerify.agent,
        }
      : null,
    recentSyncs,
    status,
  };

  return { ...base, summary: summarize(base) };
}
