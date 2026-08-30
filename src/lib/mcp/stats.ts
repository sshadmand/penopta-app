import { lookupUsers } from "@/lib/auth/users";
import { getPublicAppUrl } from "@/lib/integrations/providers";
import type { ApiKeyOwner } from "@/lib/keys/data";
import {
  type McpStatsInput,
  type McpStatsResult,
  buildMcpStatsReport,
} from "@/lib/mcp/stats-report";
import { getVisibleProject } from "@/lib/projects/data";
import { loadOrgActivityStats } from "@/lib/stats/data";

export {
  MCP_STATS_LENS_IDS,
  MCP_STATS_RANGE_IDS,
  buildMcpStatsReport,
} from "@/lib/mcp/stats-report";
export type {
  McpEffortRow,
  McpStatsInput,
  McpStatsReport,
  McpStatsResult,
  McpStatsSnapshot,
} from "@/lib/mcp/stats-report";

/** Org activity stats for the connected user, rolled up for MCP answers. */
export async function mcpGetStats(
  owner: ApiKeyOwner,
  input: McpStatsInput,
  now: Date = new Date(),
): Promise<McpStatsResult> {
  const directory = await lookupUsers([owner.ownerUserId]);
  const viewer = directory.get(owner.ownerUserId);
  const stats = await loadOrgActivityStats(owner.orgId, {
    id: owner.ownerUserId,
    name: viewer?.name,
    email: viewer?.email,
  });

  let penoptaProject: { id: string; name: string } | null = null;
  const projectRaw = input.project?.trim();
  if (projectRaw) {
    const row = await getVisibleProject(
      projectRaw,
      owner.orgId,
      owner.ownerUserId,
    );
    if (row) penoptaProject = { id: row.id, name: row.name };
  }

  return buildMcpStatsReport(stats, owner, input, {
    now,
    penoptaProject,
    url: `${getPublicAppUrl()}/analytics`,
  });
}
