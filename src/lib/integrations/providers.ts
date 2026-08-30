/**
 * Integration setup copy — edit this file to change instructions and URLs.
 * ChatGPT pastes a composed sync skill into the scheduled task. Claude saves
 * the skill under Settings → Skills, then schedules a short task that runs it
 * (plus Claude in Chrome for project/thread discovery). Delivery is through
 * the authenticated Penopta MCP connector — no key or endpoint.
 */

import type { ComponentType } from "react";

import Anthropic from "@/components/icons/Anthropic";
import Cursor from "@/components/icons/Cursor";
import OpenAI from "@/components/icons/OpenAI";
import {
  chatgptDiagnoseHref,
  claudeDiagnoseHref,
} from "@/lib/integrations/diagnose-shared";

export type IntegrationProviderId = "claude" | "chatgpt" | "cursor";

export type CopyField = {
  /** Short label above the field */
  label: string;
  /** Value shown in the copy box (may be a URL or snippet) */
  value: string;
  /** Optional hint under the field */
  hint?: string;
};

export type IntegrationTroubleHelp = {
  /** Helper copy shown before the link */
  text: string;
  /** Link label */
  linkLabel: string;
  /** Destination (e.g. Claude new chat with prefilled prompt) */
  href: string;
};

export type IntegrationProvider = {
  id: IntegrationProviderId;
  name: string;
  byline: string;
  description: string;
  iconBg: string;
  /** Brand glyph rendered inside the colored circle. */
  icon: ComponentType<{ className?: string }>;
  /** Page title on the setup screen */
  setupTitle: string;
  /** Intro paragraph under the title */
  intro: string;
  /**
   * When true, this provider is wired through Penopta Sync on macOS only —
   * no MCP connector or scheduled skill yet. The setup page skips those
   * sections and points at the Mac app.
   */
  macosOnly?: boolean;
  /** Steps to add Penopta as a live MCP connector */
  mcpSteps: string[];
  /** Numbered steps for the optional scheduled sync (or Mac app setup) */
  steps: string[];
  /** Extra notes at the bottom */
  notes?: string[];
  /** Optional “having trouble?” helper shown at the end of the MCP section */
  mcpTroubleHelp?: IntegrationTroubleHelp;
  /** Opens a new chat in the provider with the verify command prefilled */
  verifyHref?: string;
  /** Opens a new chat with the MCP diagnose self-check prefilled */
  diagnoseHref?: string;
  /** Optional “having trouble?” helper with an external guided link */
  troubleHelp?: IntegrationTroubleHelp;
  /**
   * Build a “try it now” chat URL that prefills the pasteable sync instructions
   * for a one-off run.
   */
  tryNowHref?: (instructions: string) => string;
};

/**
 * Public origin of this Penopta app (agent-sync endpoint host).
 * Prefers APP_URL, then Vercel host, then local default.
 */
export function getPublicAppUrl(): string {
  const explicit = process.env.APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl.replace(/\/+$/, "")}`;

  return "http://localhost:3200";
}

/** Hourly sync skill markdown served by this app (provider-specific). */
export function getPenoptaSkillUrl(
  provider: "chatgpt" | "claude",
  appUrl: string = getPublicAppUrl(),
): string {
  return `${appUrl.replace(/\/+$/, "")}/api/v1/sync-skill.md?provider=${provider}`;
}

/**
 * Remote MCP server URL. This is not a secret — ChatGPT/Claude connect to it as
 * a custom connector and authenticate via OAuth (sign in with Penopta). No key
 * is embedded.
 */
export function mcpConnectorUrl(appUrl: string = getPublicAppUrl()): string {
  return `${appUrl.replace(/\/+$/, "")}/api/mcp`;
}

/**
 * Pasteable sync instructions with the full skill inlined. Used by ChatGPT
 * (schedule embeds the skill). Delivery is via the authenticated Penopta MCP
 * tool (`sync_threads`) — there is no key, token, or endpoint to configure.
 */
export function syncRoutineInstructions(
  skillBody: string,
  skillVersion?: number,
): string {
  const versionLine =
    typeof skillVersion === "number"
      ? `This paste is Penopta sync skill v${skillVersion}. Pass skillVersion: ${skillVersion} on every Penopta MCP call in this run.`
      : null;

  return [
    "Follow the Penopta sync skill below: discover my provider projects into Penopta (metadata only via known_projects / make_projects_available), then sync transcripts only for projects returned by tracked_projects, and deliver with sync_threads. Skip standalone chats. Never register or sync projects/threads whose names start with P: or Private:. Your identity and target org come from the authenticated Penopta connector, so there is no key, token, or endpoint to configure — leave all credential fields out.",
    ...(versionLine ? ["", versionLine] : []),
    "",
    "----- BEGIN PENOPTA SYNC SKILL -----",
    "",
    skillBody.trim(),
    "",
    "----- END PENOPTA SYNC SKILL -----",
  ].join("\n");
}

/** Suggested Claude Skills name when creating the Penopta hourly sync skill. */
export const CLAUDE_SYNC_SKILL_NAME = "penopta-sync-skill";

/**
 * Claude in Chrome — required so scheduled sync can enumerate claude.ai
 * projects and threads (no native listing API in the schedule environment).
 * @see https://chromewebstore.google.com/detail/claude/fcoeoabgfenejglbffodgkkbkcdhcgfn
 */
export const CLAUDE_CHROME_EXTENSION_HREF =
  "https://chromewebstore.google.com/detail/claude/fcoeoabgfenejglbffodgkkbkcdhcgfn?hl=en-US";

/**
 * Body to paste into Claude Settings → Skills → Write skill instructions.
 * Raw composed skill markdown (no schedule wrapper).
 */
export function claudeSkillInstructions(skillBody: string): string {
  return skillBody.trim();
}

/**
 * Short Claude scheduled-task instructions that invoke the saved skill
 * instead of inlining the full skill body again.
 */
export function claudeScheduleInstructions(
  skillVersion?: number,
  skillName: string = CLAUDE_SYNC_SKILL_NAME,
): string {
  const versionLine =
    typeof skillVersion === "number"
      ? `Pass skillVersion: ${skillVersion} on every Penopta MCP call (same version as in the skill).`
      : null;

  return [
    `Run my "${skillName}" skill and follow it exactly for this hourly Penopta sync.`,
    "Discover Claude projects into Penopta (metadata only via known_projects / make_projects_available), sync transcripts only for projects returned by tracked_projects, and deliver with sync_threads. Skip standalone chats. Never register or sync projects/threads whose names start with P: or Private:.",
    "Use Claude in Chrome tools when the skill requires browser discovery. Keep Chrome open and signed in so project/thread listing works.",
    "Your identity and target org come from the authenticated Penopta connector — do not paste a key, token, or endpoint.",
    ...(versionLine ? [versionLine] : []),
  ].join("\n\n");
}

/**
 * The one-liner we ask users to send in provider chat so the connector calls
 * `penopta_verify`, which is what unlocks the sync setup on the setup page.
 */
export const VERIFY_CHAT_COMMAND = "Run penopta_verify tool";

/** Open Claude with the verify command prefilled. */
export function claudeVerifyHref(): string {
  return `https://claude.ai/new?q=${encodeURIComponent(VERIFY_CHAT_COMMAND)}`;
}

/** Open ChatGPT with the verify command prefilled. */
export function chatgptVerifyHref(): string {
  return `https://chatgpt.com/?q=${encodeURIComponent(VERIFY_CHAT_COMMAND)}`;
}

/** Prefilled Claude chat that walks the user through Penopta scheduled-task setup. */
export function claudeInstallHelpHref(): string {
  const prompt = [
    "Walk me through setting up Penopta hourly sync in the Claude desktop app.",
    "First I need the Claude in Chrome extension installed and signed in (required to list claude.ai projects and threads).",
    `Then I create a Skill under Settings → Skills → Add → Write skill instructions, named ${CLAUDE_SYNC_SKILL_NAME}, and paste Penopta's skill instructions there.`,
    'Then I create a scheduled task named "Penopta Sync" whose Instructions only tell Claude to run that skill (not the full skill body again), Frequency Hourly.',
    'After creating it, I need to run the scheduled task once and choose "Always allow" when Penopta or Chrome tools ask for permission, and keep Chrome open when it runs.',
    "Claude's UI may have changed — show me the current steps for Skills and Scheduled, and point out where each setting lives.",
  ].join(" ");

  return `https://claude.ai/new?q=${encodeURIComponent(prompt)}`;
}

/** Prefilled ChatGPT chat that walks the user through a Penopta scheduled task. */
export function chatgptInstallHelpHref(): string {
  const prompt = [
    "Walk me through setting up a Penopta sync as a ChatGPT scheduled task.",
    'I want to create a scheduled task named "Penopta Sync".',
    "I'll paste the Penopta sync instructions (a skill that delivers via the Penopta MCP server — no key or endpoint) into the task description, set Runs in to ChatGPT cloud, and set Frequency to Custom Hourly (every 1 hour).",
    'After creating it, I need to run the scheduled task once and choose "Always allow" when Penopta tools ask for permission, so later hourly runs finish without waiting for approval.',
    "ChatGPT's UI may have changed — show me the current steps to open Scheduled tasks, create one manually, run it once, and point out where each setting lives.",
  ].join(" ");

  return `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`;
}

/** Prefilled Claude chat that walks the user through adding the Penopta MCP connector. */
export function claudeMcpHelpHref(): string {
  const prompt = [
    "Walk me through adding Penopta as an MCP connector in Claude.",
    "Prefer Penopta from the Connectors directory when it is listed; otherwise add a custom connector with the remote MCP server URL, then approve the Penopta sign-in (OAuth) prompt.",
    "Claude's UI may have changed — show me the current steps to open Settings > Connectors, add from the directory or as a custom connector, and point out where each setting lives.",
  ].join(" ");

  return `https://claude.ai/new?q=${encodeURIComponent(prompt)}`;
}

/** Prefilled ChatGPT chat that walks the user through adding the Penopta MCP server. */
export function chatgptMcpHelpHref(): string {
  const prompt = [
    "Walk me through adding Penopta as an MCP server in ChatGPT.",
    'I want to add a Streamable HTTP MCP server named "Penopta" and paste in its MCP server URL, then approve the Penopta sign-in (OAuth) prompt.',
    "ChatGPT's UI may have changed — show me the current steps to open Settings > Plugins > MCPs, add a server, and point out where each setting lives.",
  ].join(" ");

  return `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`;
}

/** Open Claude with the sync instructions prefilled so the user can try a one-off run. */
export function claudeTryNowHref(instructions: string): string {
  return `https://claude.ai/new?q=${encodeURIComponent(instructions)}`;
}

/** Open ChatGPT with the sync instructions prefilled so the user can try a one-off run. */
export function chatgptTryNowHref(instructions: string): string {
  return `https://chatgpt.com/?q=${encodeURIComponent(instructions)}`;
}

export function listIntegrationProviders(): IntegrationProvider[] {
  return [
    {
      id: "claude",
      name: "Claude",
      byline: "by Anthropic",
      description:
        "Connect Claude to power your agents with advanced reasoning and natural conversation.",
      iconBg: "bg-[#d97757]",
      icon: Anthropic,
      setupTitle: "Connect Claude",
      intro:
        "Add Penopta as an MCP connector for live context in chat, and/or optionally set up an hourly sync: install Claude in Chrome, save a Skill, then schedule a task that runs that skill.",
      mcpSteps: [
        "In Claude, open **Settings** and select **Connectors** under Customize.",
        "Prefer **Penopta** from the Connectors directory when it is listed. Otherwise click **Add**, then **Add custom connector**.",
        'If adding a custom connector, enter a **Name** (e.g. "Penopta").',
        "Paste the MCP server URL below into **Remote MCP server URL** (custom only).",
        "Click **Add** / **Connect**, then approve the Penopta sign-in prompt when asked.",
      ],
      steps: [
        `Install the [Claude in Chrome](${CLAUDE_CHROME_EXTENSION_HREF}) browser extension and sign in. Claude has no native way to list claude.ai projects or threads — the scheduled sync uses Chrome tools for discovery. Keep Chrome open when the task runs.`,
        "Open the **Claude desktop app**. Skills and scheduled tasks for this sync are set up there.",
        "Go to **Settings** → **Skills** (under Customize).",
        "Click **Add**, then choose **Write skill instructions**.",
        `Name the skill **"${CLAUDE_SYNC_SKILL_NAME}"**.`,
        "**Copy the Skill instructions** below and paste them into the skill, then save.",
        "Go to **Home** → **Scheduled** → **New task** → **Set up manually**.",
        'Name it **"Penopta Sync"**. Add a short **Description** (e.g. “Hourly sync of Claude projects and conversations to Penopta”).',
        "**Copy the Scheduled task instructions** below into the task’s **Instructions** field — they tell Claude to run your skill (do not paste the full skill again).",
        "Set **Frequency** to **Hourly**, then **Save**.",
        "IMPORTANT: **Run the scheduled task once**. When Penopta or Chrome tools ask for permission, choose **Always allow** — hourly runs are unattended, and anything left needing approval will stop the sync from finishing.",
      ],
      notes: [],
      verifyHref: claudeVerifyHref(),
      diagnoseHref: claudeDiagnoseHref(),
      mcpTroubleHelp: {
        text: "Need help? Use chat for latest setup instructions:",
        linkLabel: "Ask Claude for guidance",
        href: claudeMcpHelpHref(),
      },
      troubleHelp: {
        text: "Need help? Use chat for latest setup instructions:",
        linkLabel: "Ask Claude for guidance",
        href: claudeInstallHelpHref(),
      },
      tryNowHref: claudeTryNowHref,
    },
    {
      id: "chatgpt",
      name: "ChatGPT",
      byline: "by OpenAI",
      description:
        "Connect ChatGPT to leverage GPT-4 capabilities for intelligent agent interactions.",
      iconBg: "bg-[#10a37f]",
      icon: OpenAI,
      setupTitle: "Connect ChatGPT",
      intro:
        "Add Penopta as an MCP server for live context in chat, or optionally set up an hourly scheduled sync.",
      mcpSteps: [
        "In ChatGPT, open **Settings** and select **Plugins** in the sidebar.",
        "Open the **MCPs** tab, then click **+ Add server**.",
        'Enter a **Name** (e.g. "Penopta").',
        "Choose **Streamable HTTP** as the type.",
        "Paste the MCP server URL below into the **URL** field.",
        "Leave **Bearer token env var** empty — Penopta uses OAuth sign-in, not `MCP_BEARER_TOKEN`.",
        "Click **Save**, then approve the Penopta sign-in prompt when asked. If tools later fail with “No authorization provided,” uninstall and re-add so OAuth runs again.",
      ],
      steps: [
        "Copy the Instructions below — they contain the full sync skill. Delivery runs through the Penopta MCP server you added above, so there's no key or token to paste.",
        "In ChatGPT, open Scheduled tasks, click Create, and choose “Set up manually”.",
        'Name the task "Penopta Sync".',
        "Paste the Instructions into the “Describe what ChatGPT should do” field.",
        "Under Details, set Runs in to “ChatGPT cloud”. Under Frequency, set Repeat to Custom and Repeats to Hourly (every 1 hour), then save the task.",
        "**Run the scheduled task now** once. Penopta will ask for your permission on each step. Choose **Always allow**, __anything not approved will stop the sync from running in the future.__",
      ],
      notes: [],
      verifyHref: chatgptVerifyHref(),
      diagnoseHref: chatgptDiagnoseHref(),
      mcpTroubleHelp: {
        text: "Use ChatGPT's own chat for up-to-date setup instructions:",
        linkLabel: "Ask ChatGPT for guidance",
        href: chatgptMcpHelpHref(),
      },
      troubleHelp: {
        text: "Use ChatGPT's own chat for up-to-date setup instructions:",
        linkLabel: "Ask ChatGPT for guidance",
        href: chatgptInstallHelpHref(),
      },
      tryNowHref: chatgptTryNowHref,
    },
    {
      id: "cursor",
      name: "Cursor",
      byline: "by Anysphere",
      description:
        "Sync local Cursor agent chats into Penopta with the macOS companion app.",
      iconBg: "bg-black",
      icon: Cursor,
      setupTitle: "Connect Cursor",
      intro:
        "Cursor agent transcripts live on your Mac under ~/.cursor. Penopta Sync reads them and uploads them to your org — there’s no Cursor MCP connector yet.",
      macosOnly: true,
      mcpSteps: [],
      steps: [
        "Install **Penopta Sync** from the macOS integration page (open the DMG, drag to Applications, then Right-click → Open the first time).",
        "Sign in with the same Penopta account you use here.",
        "Grant folder access to **~/.cursor**, then press **Sync** (or leave the app running for hourly auto-sync).",
        "Return here — once a sync lands, this integration shows as connected and Cursor projects appear below.",
      ],
      notes: [
        "Only parent agent chats are uploaded; nested subagent transcripts are skipped.",
        "Sessions titled or living under projects prefixed with P: or Private: are never uploaded.",
      ],
    },
  ];
}

export function getIntegrationProvider(
  id: string,
): IntegrationProvider | undefined {
  return listIntegrationProviders().find((p) => p.id === id);
}
