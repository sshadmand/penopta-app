/**
 * MCP integration page copy + catalog of Penopta MCP tools.
 * Keep tool names/descriptions aligned with `src/lib/mcp/server.ts`.
 */

import type { ComponentType } from "react";

import Apple from "@/components/icons/Apple";
import { macosIntegration } from "@/lib/integrations/macos";
import { integrationPath } from "@/lib/integrations/paths";
import {
  listIntegrationProviders,
  type IntegrationProvider,
} from "@/lib/integrations/providers";

export type McpToolCategory = "connection" | "read" | "sync" | "chatgpt-compat";

export type McpToolInfo = {
  name: string;
  title: string;
  category: McpToolCategory;
  /** Short plain-language explanation for the integrations page. */
  summary: string;
  /** When an agent would typically call this. */
  whenToUse: string;
  /**
   * Show on the MCP settings page. False for scheduled-skill internals and
   * ChatGPT search/fetch shims — users don't ask for those by name.
   */
  listOnPage?: boolean;
};

export const mcpIntegration = {
  id: "mcp" as const,
  name: "MCPs",
  byline: "Penopta connector tools",
  description:
    "Commands your agents can call after you add Penopta as an MCP server in Claude, ChatGPT, or another client.",
  setupTitle: "Penopta MCP tools",
  intro:
    "Once Penopta is connected as an MCP server, you can ask your agent to verify the link, look up project and thread context, pull activity stats, sync now, or push this chat into Penopta. Identity and org come from the OAuth connection — no API key to paste.",
  /** Light well — the MCP mark is dark. */
  iconBg: "bg-surface border border-border",
};

export const MCP_TOOL_CATEGORY_LABELS: Record<McpToolCategory, string> = {
  connection: "Connection",
  read: "Read & search",
  sync: "Sync & track",
  "chatgpt-compat": "ChatGPT search / fetch",
};

/** Setup destinations shown above the tool list. */
export type McpSetupLink = {
  id: string;
  label: string;
  href: string;
  byline: string;
  iconBg: string;
  icon: ComponentType<{ className?: string }>;
};

function setupLabelForProvider(provider: IntegrationProvider): string {
  if (provider.id === "claude") return "Integrate Claude";
  if (provider.id === "chatgpt") return "Integrate OpenAI";
  if (provider.id === "cursor") return "Integrate Cursor";
  return `Integrate ${provider.name}`;
}

export function listMcpSetupLinks(): McpSetupLink[] {
  // Cursor is macOS-only today — don’t list it as an MCP setup destination.
  const providers = listIntegrationProviders().filter((p) => !p.macosOnly);
  return [
    ...providers.map((provider) => ({
      id: provider.id,
      label: setupLabelForProvider(provider),
      href: integrationPath(provider.id),
      byline: provider.byline,
      iconBg: provider.iconBg,
      icon: provider.icon,
    })),
    {
      id: macosIntegration.id,
      label: macosIntegration.name,
      href: integrationPath(macosIntegration.id),
      byline: macosIntegration.byline,
      iconBg: macosIntegration.iconBg,
      icon: Apple,
    },
  ];
}

export function listMcpTools(): McpToolInfo[] {
  return [
    {
      name: "penopta_verify",
      title: "Verify Penopta connection",
      category: "connection",
      listOnPage: true,
      summary:
        "Confirms the MCP connector is installed, signed in, and talking to the right Penopta user and org.",
      whenToUse:
        "When you ask whether Penopta is set up correctly, or during first-time connector setup.",
    },
    {
      name: "penopta_diagnose",
      title: "Diagnose Penopta connection",
      category: "connection",
      listOnPage: true,
      summary:
        "Returns OAuth status, last verify, recent sync deliveries, and a triage summary so you can tell auth problems from missing client tools.",
      whenToUse:
        "When sync fails, tools seem missing, or you need a definitive connection health report.",
    },
    {
      name: "penopta_list_projects",
      title: "List workgroups",
      category: "read",
      listOnPage: true,
      summary: "Lists workgroups you can see, with ids, slugs, and summaries.",
      whenToUse:
        "To find which workgroup a question is about before pulling deeper context.",
    },
    {
      name: "penopta_get_project_context",
      title: "Get workgroup context",
      category: "read",
      listOnPage: true,
      summary:
        "Returns a workgroup plus condensed context from its linked threads — objectives, status, next actions, open questions — and the latest continue-work brief when one exists.",
      whenToUse:
        "To ground an answer in what has actually happened in a workgroup, or to pick up the human's unfinished objectives.",
    },
    {
      name: "penopta_search_threads",
      title: "Search threads",
      category: "read",
      listOnPage: true,
      summary:
        "Searches conversation threads by keywords, optionally limited to one workgroup.",
      whenToUse:
        "When you need matching threads and snippets, then follow up with penopta_get_thread for full detail.",
    },
    {
      name: "penopta_get_thread",
      title: "Get thread",
      category: "read",
      listOnPage: true,
      summary:
        "Returns full detail for one thread: working state, decisions, artifacts, open questions, and the activity log.",
      whenToUse:
        "After penopta_search_threads (or when you already know the thread id).",
    },
    {
      name: "penopta_get_stats",
      title: "Get activity stats",
      category: "read",
      listOnPage: true,
      summary:
        "Returns estimated tokens, sessions, streaks, busiest days, and effort by plan, workgroup, agent, and person.",
      whenToUse:
        "When you ask how much you (or the team) have been working, for token usage, or for a stats summary.",
    },
    {
      name: "known_projects",
      title: "Known provider projects",
      category: "sync",
      listOnPage: false,
      summary:
        "Lists ChatGPT or Claude projects already in Penopta’s available catalog (metadata only — no transcripts).",
      whenToUse:
        "During sync discovery, before registering unknown projects with make_projects_available.",
    },
    {
      name: "make_projects_available",
      title: "Make provider projects available",
      category: "sync",
      listOnPage: false,
      summary:
        "Registers unknown provider projects in the catalog (id, name, optional created time). Does not change tracking. Skips P: / Private: names.",
      whenToUse:
        "When discovery finds projects Penopta does not know about yet.",
    },
    {
      name: "tracked_projects",
      title: "Tracked provider projects",
      category: "sync",
      listOnPage: false,
      summary:
        "Returns the provider projects you opted to track for transcript sync.",
      whenToUse:
        "Before a sync run — only threads from these projects should be delivered.",
    },
    {
      name: "penopta_sync_now",
      title: "Sync now",
      category: "sync",
      listOnPage: true,
      summary:
        "Starts an immediate sync window in the current chat (does not wait for the hourly schedule). Returns the window, tracked projects, and steps to run; delivery still uses sync_threads.",
      whenToUse:
        "When you ask to sync now, refresh Penopta, or run sync outside the schedule.",
    },
    {
      name: "sync_threads",
      title: "Sync threads",
      category: "sync",
      listOnPage: false,
      summary:
        "Delivers a windowed batch of thread context to Penopta. Identity and org come from the authenticated connector — no API key. Idempotent by runId.",
      whenToUse:
        "The write path for hourly (and sync-now) runs after collecting threads from tracked projects.",
    },
    {
      name: "penopta_track_thread",
      title: "Track thread",
      category: "sync",
      listOnPage: true,
      summary:
        "Pushes a single conversation into Penopta for later search, project context, and handoffs — including standalone chats outside tracked projects.",
      whenToUse:
        "When you ask to track, save, or sync this chat live. Not used by the hourly bulk skill.",
    },
    {
      name: "search",
      title: "Search",
      category: "chatgpt-compat",
      listOnPage: false,
      summary:
        "ChatGPT-connector-shaped search over Penopta threads. Returns result ids for fetch.",
      whenToUse:
        "Used by ChatGPT’s expected search/fetch connector pair; same idea as penopta_search_threads.",
    },
    {
      name: "fetch",
      title: "Fetch",
      category: "chatgpt-compat",
      listOnPage: false,
      summary:
        "Fetches the full text of one Penopta thread by an id returned from search.",
      whenToUse:
        "The companion to search for ChatGPT connectors; similar to penopta_get_thread.",
    },
  ];
}

/** Tools shown on the MCP settings page (user-facing only). */
export function listMcpToolsByCategory(): {
  category: McpToolCategory;
  label: string;
  tools: McpToolInfo[];
}[] {
  const tools = listMcpTools().filter((t) => t.listOnPage !== false);
  const order: McpToolCategory[] = [
    "connection",
    "read",
    "sync",
    "chatgpt-compat",
  ];
  return order
    .map((category) => ({
      category,
      label: MCP_TOOL_CATEGORY_LABELS[category],
      tools: tools.filter((t) => t.category === category),
    }))
    .filter((group) => group.tools.length > 0);
}
