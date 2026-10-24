import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { agentSyncRuns } from "@/lib/db/schema";
import type { ProviderProjectProvider } from "@/lib/integrations/provider-projects";
import { PENOPTA_SYNC_AGENT_ID } from "@/lib/integrations/provider-projects-data";
import { PENOPTA_SYNC_APP_STORE_URL } from "@/lib/integrations/macos-release";
import { getPublicAppUrl } from "@/lib/integrations/providers";

export type { PenoptaSyncRelease } from "@/lib/integrations/macos-release";
export {
  getPenoptaSyncDirectDownloadUrl,
  getPenoptaSyncDownloadUrl,
  getPenoptaSyncManifestUrl,
  getPenoptaSyncRelease,
  PENOPTA_SYNC_APP_STORE_URL,
} from "@/lib/integrations/macos-release";

/** How this site offers the Mac app: Mac App Store, or a direct DMG. */
export type MacosInstallChannel = "app-store" | "direct";

const SETUP_STEPS = [
  "Open the app — Penopta loads in a window. Choose **Sign in to Penopta** for the system sign-in sheet (Google, GitHub, or passkey). That same sign-in is used for sync.",
  "You may be asked to grant folder access on your mac",
  "Return here once a sync lands, this integration shows as installed.",
];

export const macosIntegration = {
  id: "macos" as const,
  name: "MacOS",
  byline: "Penopta Sync",
  description:
    "The macOS app opens Penopta in a native window, and syncs local Claude Code, Codex, and Cursor sessions that skills and MCP agents can’t see — hourly in the background while it runs, or on demand.",
  setupTitle: "Install Penopta Sync",
  intro:
    "Opening the app loads your Penopta workspace in a window. The menu-bar reads local Claude Code, Codex, and Cursor sessions you choose, then uploads them to your Penopta org with the same private-prefix skip rules (P: / Private:). It syncs about once an hour (based on settings) while the app stays running.",
  iconBg: "bg-black",
  appStoreSteps: [
    "Get **Penopta Sync** from the **Mac App Store**.",
    ...SETUP_STEPS,
  ],
  directSteps: [
    "Download **Penopta Sync** for macOS (a disk image).",
    "Open the DMG, then **drag Penopta Sync into Applications**.",
    "In Finder → Applications, **Right-click** (or Control-click) **Penopta Sync** → **Open**. Don’t double-click the first time — macOS blocks unsigned downloads that way.",
    "If macOS still says it can’t be opened, go to **System Settings → Privacy & Security**, scroll to the message about Penopta Sync, and click **Open Anyway**. Confirm with **Open** when asked.",
    ...SETUP_STEPS,
  ],
  directNotes: [
    "This download is not from the Mac App Store, so Gatekeeper may warn once. After you Open / Open Anyway, normal launches work.",
    "The app checks Penopta for a newer build on launch and every few hours. Connection → Check for updates also works; Download opens the DMG — drag the new app into Applications to replace it.",
  ],
  notes: [
    "Closing the window leaves Penopta Sync in the Dock and menu bar so hourly auto-sync can keep running. Turn it off under Connection → Sync every hour if you only want manual Sync.",
    "Release builds default to https://app.penopta.com. Override Penopta URL in Connection (gear) for local or stage — this workspace is " +
      getPublicAppUrl() +
      ".",
    "Sessions titled or living under projects prefixed with P: or Private: are never uploaded.",
  ],
};

const MACOS_INSTALL_HELP_INSTALL: Record<MacosInstallChannel, string[]> = {
  "app-store": [
    "Penopta Sync is a Mac app that opens Penopta in a window and syncs local Claude Code, Codex, and Cursor sessions.",
    `I will install it from the Mac App Store (${PENOPTA_SYNC_APP_STORE_URL}); updates come through the App Store.`,
  ],
  direct: [
    "Penopta Sync is a Mac app (downloaded directly, not from the Mac App Store) that opens Penopta in a window and syncs local Claude Code, Codex, and Cursor sessions.",
    "I will download a DMG, open it, and drag Penopta Sync into Applications.",
    "Because it is unsigned/not notarized yet, macOS Gatekeeper may block it: I should Right-click → Open the first time, and if still blocked go to System Settings → Privacy & Security → Open Anyway.",
  ],
};

function macosInstallHelpPrompt(channel: MacosInstallChannel): string {
  return [
    "Walk me through installing and setting up Penopta Sync on macOS.",
    ...MACOS_INSTALL_HELP_INSTALL[channel],
    "Then I choose Sign in to Penopta for the system Safari sign-in sheet (Google, GitHub, or passkey) — that same account is used for sync. Then I grant folder access for Claude Code, Codex, and/or Cursor, and press Sync (or leave the app running for hourly auto-sync).",
    "Closing the window keeps it in the Dock and menu bar so hourly sync keeps running. Sessions in projects prefixed P: or Private: are never uploaded.",
    "macOS UI labels may have changed — show me the current steps and where each setting lives.",
  ].join(" ");
}

/** Prefill Claude with macOS Penopta Sync install help. */
export function claudeMacosInstallHelpHref(
  channel: MacosInstallChannel,
): string {
  return `https://claude.ai/new?q=${encodeURIComponent(macosInstallHelpPrompt(channel))}`;
}

/** Prefill ChatGPT with macOS Penopta Sync install help. */
export function chatgptMacosInstallHelpHref(
  channel: MacosInstallChannel,
): string {
  return `https://chatgpt.com/?q=${encodeURIComponent(macosInstallHelpPrompt(channel))}`;
}

/** Agent names the macOS app uses for each integrations provider. */
export function macSyncAgentNamesForProvider(
  provider: ProviderProjectProvider,
): string[] {
  switch (provider) {
    case "claude":
      return ["claude-code", "claude"];
    case "chatgpt":
      // Codex CLI is the local OpenAI agent the mac app syncs today.
      return ["chatgpt", "codex", "openai"];
    case "cursor":
      return ["cursor"];
  }
}

export type PenoptaSyncInstallStatus = {
  installed: boolean;
  lastSyncedAt: Date | null;
  lastAgentName: string | null;
};

/** True once this org has received at least one upload from the macOS app. */
export async function getPenoptaSyncInstallStatus(
  orgId: string,
): Promise<PenoptaSyncInstallStatus> {
  const [match] = await db
    .select({
      createdAt: agentSyncRuns.createdAt,
      agentName: agentSyncRuns.agentName,
    })
    .from(agentSyncRuns)
    .where(
      and(
        eq(agentSyncRuns.orgId, orgId),
        eq(agentSyncRuns.agentId, PENOPTA_SYNC_AGENT_ID),
      ),
    )
    .orderBy(desc(agentSyncRuns.createdAt))
    .limit(1);

  if (!match) {
    return { installed: false, lastSyncedAt: null, lastAgentName: null };
  }
  return {
    installed: true,
    lastSyncedAt: match.createdAt,
    lastAgentName: match.agentName,
  };
}

/**
 * Whether the macOS app has synced threads for this integrations provider
 * (e.g. Claude Code → Claude, Codex → ChatGPT).
 */
export async function getPenoptaSyncStatusForProvider(
  orgId: string,
  provider: ProviderProjectProvider,
): Promise<PenoptaSyncInstallStatus> {
  const names = macSyncAgentNamesForProvider(provider);
  const [match] = await db
    .select({
      createdAt: agentSyncRuns.createdAt,
      agentName: agentSyncRuns.agentName,
    })
    .from(agentSyncRuns)
    .where(
      and(
        eq(agentSyncRuns.orgId, orgId),
        eq(agentSyncRuns.agentId, PENOPTA_SYNC_AGENT_ID),
        inArray(agentSyncRuns.agentName, names),
      ),
    )
    .orderBy(desc(agentSyncRuns.createdAt))
    .limit(1);

  if (!match) {
    return { installed: false, lastSyncedAt: null, lastAgentName: null };
  }
  return {
    installed: true,
    lastSyncedAt: match.createdAt,
    lastAgentName: match.agentName,
  };
}
