import { and, desc, eq, inArray } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { db } from "@/lib/db/client";
import { agentSyncRuns } from "@/lib/db/schema";
import type { ProviderProjectProvider } from "@/lib/integrations/provider-projects";
import { PENOPTA_SYNC_AGENT_ID } from "@/lib/integrations/provider-projects-data";
import { getPublicAppUrl } from "@/lib/integrations/providers";

export type PenoptaSyncRelease = {
  version: string;
  build: number;
  /** MD5 of the published .app contents; used by Mac-repo `scripts/publish.sh`. */
  contentMd5?: string;
  downloadPath?: string;
  downloadUrl?: string;
  notes?: string;
  publishedAt?: string;
};

/**
 * Prefer `PENOPTA_SYNC_DOWNLOAD_URL`, then the manifest `downloadUrl`
 * (GitHub Release asset), then `downloadPath` on this origin (legacy).
 */
export function getPenoptaSyncDownloadUrl(
  release?: PenoptaSyncRelease | null,
): string {
  const explicit = process.env.PENOPTA_SYNC_DOWNLOAD_URL?.trim();
  if (explicit) return explicit;
  const absolute = release?.downloadUrl?.trim();
  if (absolute) return absolute;
  const downloadPath = release?.downloadPath?.trim();
  if (downloadPath) {
    const normalized = downloadPath.startsWith("/")
      ? downloadPath
      : `/${downloadPath}`;
    return `${getPublicAppUrl()}${normalized}`;
  }
  return `${getPublicAppUrl()}/downloads/Penopta-Sync.dmg`;
}

/** Soft-update manifest (`scripts/publish.sh` in the Mac repo writes it). */
export function getPenoptaSyncManifestUrl(): string {
  return `${getPublicAppUrl()}/downloads/Penopta-Sync.json`;
}

/** Latest published macOS app version from `public/downloads/Penopta-Sync.json`. */
export async function getPenoptaSyncRelease(): Promise<PenoptaSyncRelease | null> {
  try {
    const filePath = path.join(
      process.cwd(),
      "public/downloads/Penopta-Sync.json",
    );
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<PenoptaSyncRelease>;
    if (
      typeof parsed.version !== "string" ||
      !parsed.version.trim() ||
      typeof parsed.build !== "number" ||
      !Number.isInteger(parsed.build) ||
      parsed.build < 1
    ) {
      return null;
    }
    return {
      version: parsed.version.trim(),
      build: parsed.build,
      contentMd5:
        typeof parsed.contentMd5 === "string" ? parsed.contentMd5 : undefined,
      downloadPath: parsed.downloadPath,
      downloadUrl: parsed.downloadUrl,
      notes: parsed.notes,
      publishedAt: parsed.publishedAt,
    };
  } catch {
    return null;
  }
}

export const macosIntegration = {
  id: "macos" as const,
  name: "MacOS",
  byline: "Penopta Sync",
  description:
    "The macOS app opens Penopta in a native window, and syncs local Claude Code, Codex, and Cursor sessions that skills and MCP agents can’t see — hourly in the background while it runs, or on demand.",
  setupTitle: "Install Penopta Sync",
  intro:
    "Penopta Sync is a Mac app. Opening it loads your Penopta workspace in a window. Sign in with the system Safari sheet (Google, GitHub, or passkey — same as the website). Sync uses that session, not a second login. The menu-bar extra reads local Claude Code, Codex, and Cursor sessions you choose, then uploads them to your Penopta org with the same private-prefix skip rules (P: / Private:). Once signed in with folder access, it syncs about once an hour while the app stays running (you can still press Sync anytime).",
  iconBg: "bg-black",
  steps: [
    "Download **Penopta Sync** for macOS (a disk image).",
    "Open the DMG, then **drag Penopta Sync into Applications**.",
    "In Finder → Applications, **Right-click** (or Control-click) **Penopta Sync** → **Open**. Don’t double-click the first time — macOS blocks unsigned downloads that way.",
    "If macOS still says it can’t be opened, go to **System Settings → Privacy & Security**, scroll to the message about Penopta Sync, and click **Open Anyway**. Confirm with **Open** when asked.",
    "Open the app — Penopta loads in a window. Choose **Sign in to Penopta** for the system sign-in sheet (Google, GitHub, or passkey). That same sign-in is used for sync.",
    "Grant folder access for **Claude Code**, **Codex**, and/or **Cursor**, then press **Sync** (or wait for the hourly auto-sync).",
    "Return here — once a sync lands, this integration shows as installed.",
  ],
  notes: [
    "This app is not from the Mac App Store, so Gatekeeper may warn once. After you Open / Open Anyway, normal launches work.",
    "Closing the window leaves Penopta Sync in the Dock and menu bar so hourly auto-sync can keep running. Turn it off under Connection → Sync every hour if you only want manual Sync.",
    "The app checks Penopta for a newer build on launch and every few hours. Connection → Check for updates also works; Download opens the DMG — drag the new app into Applications to replace it.",
    "Release builds default to https://app.penopta.com. Override Penopta URL in Connection (gear) for local or stage — this workspace is " +
      getPublicAppUrl() +
      ".",
    "Sessions titled or living under projects prefixed with P: or Private: are never uploaded.",
  ],
};

const MACOS_INSTALL_HELP_PROMPT = [
  "Walk me through installing and setting up Penopta Sync on macOS.",
  "Penopta Sync is a Mac app (not from the Mac App Store) that opens Penopta in a window and syncs local Claude Code, Codex, and Cursor sessions.",
  "I will download a DMG, open it, and drag Penopta Sync into Applications.",
  "Because it is unsigned/not notarized yet, macOS Gatekeeper may block it: I should Right-click → Open the first time, and if still blocked go to System Settings → Privacy & Security → Open Anyway.",
  "Then I choose Sign in to Penopta for the system Safari sign-in sheet (Google, GitHub, or passkey) — that same account is used for sync. Then I grant folder access for Claude Code, Codex, and/or Cursor, and press Sync (or leave the app running for hourly auto-sync).",
  "macOS UI labels may have changed — show me the current steps and where each setting lives.",
].join(" ");

/** Prefill Claude with macOS Penopta Sync install help. */
export function claudeMacosInstallHelpHref(): string {
  return `https://claude.ai/new?q=${encodeURIComponent(MACOS_INSTALL_HELP_PROMPT)}`;
}

/** Prefill ChatGPT with macOS Penopta Sync install help. */
export function chatgptMacosInstallHelpHref(): string {
  return `https://chatgpt.com/?q=${encodeURIComponent(MACOS_INSTALL_HELP_PROMPT)}`;
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
