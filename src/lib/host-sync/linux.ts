import { and, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { agentSyncRuns } from "@/lib/db/schema";
import { hasActiveHostToken } from "@/lib/host-sync/tokens";
import { getPublicAppUrl } from "@/lib/integrations/providers";

/** Linux host-sync producer id (see penopta-linux-sync). */
export const PENOPTA_SYNC_LINUX_AGENT_ID = "penopta-sync-linux";

export const linuxIntegration = {
  id: "linux" as const,
  name: "Linux",
  byline: "Host sync",
  description:
    "A headless CLI that reads Claude Code and Codex sessions on a Linux box and uploads them to your Penopta org — hourly via systemd, no GUI.",
  setupTitle: "Install Linux host sync",
  intro:
    "Linux host sync is a command-line companion. Install the binary, run login, and confirm the machine in the browser. A systemd user timer then syncs about once an hour. Auth is a host token (hst_…) scoped to this box — not your skill API key.",
  iconBg: "bg-black",
  steps: [
    "On the Linux box, run the install one-liner below (it puts `penopta-sync` in `~/.local/bin`).",
    "Run **penopta-sync login**. It prints a URL.",
    "Open that URL here (you’re already signed in), confirm this machine for the **active org**, and wait for the CLI to finish.",
    "Leave the timer running. Return here — once a token exists or a sync lands, this integration shows as installed.",
  ],
  notes: [
    "Host tokens last 90 days. Refresh from this page (or run `penopta-sync login` again) before they expire — ingest returns 401 after expiry, it does not silently skip.",
    "Sessions titled or living under projects prefixed with P: or Private: are never uploaded.",
    "Cursor on Linux is a later CLI release. Already-installed boxes pick it up with `penopta-sync update` (or re-running the install script); no re-login.",
    "The install script should enable lingering (`loginctl enable-linger`) so hourly sync still runs after SSH logout. If it can’t, it will say so.",
  ],
};

export function linuxInstallCommand(appUrl: string = getPublicAppUrl()): string {
  return `curl -fsSL ${appUrl}/install-sync.sh | sh`;
}

export type LinuxSyncInstallStatus = {
  installed: boolean;
  lastSyncedAt: Date | null;
  lastAgentName: string | null;
  hasToken: boolean;
};

/** True once this org has a live host token or a Linux ingest. */
export async function getLinuxSyncInstallStatus(
  orgId: string,
): Promise<LinuxSyncInstallStatus> {
  const [match, hasToken] = await Promise.all([
    db
      .select({
        createdAt: agentSyncRuns.createdAt,
        agentName: agentSyncRuns.agentName,
      })
      .from(agentSyncRuns)
      .where(
        and(
          eq(agentSyncRuns.orgId, orgId),
          eq(agentSyncRuns.agentId, PENOPTA_SYNC_LINUX_AGENT_ID),
        ),
      )
      .orderBy(desc(agentSyncRuns.createdAt))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    hasActiveHostToken(orgId),
  ]);

  return {
    installed: Boolean(match) || hasToken,
    lastSyncedAt: match?.createdAt ?? null,
    lastAgentName: match?.agentName ?? null,
    hasToken,
  };
}
