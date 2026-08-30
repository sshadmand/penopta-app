import { resolveSourceProjectLabel } from "@/lib/integrations/provider-projects-view";
import type { AgentThreadRow } from "@/lib/db/schema";
import { UNGROUPED_SOURCE_PROJECT_LABEL } from "@/lib/threads/group";

/** Start a new activity notice when a thread is quiet for this long. */
const ACTIVITY_GAP_MS = 5 * 60 * 1000;

export type ProjectActivityLine = {
  key: string;
  timeLabel: string;
  threadId: string;
  threadTitle: string;
  /** Source project label (catalog name or raw context). */
  projectLabel: string;
  /** Agent that produced the thread (e.g. `cursor`, `claude-code`). */
  agentName: string;
  sortAt: number;
};

type SourceCatalogEntry = { name: string; projectId: string };

/** Compact time like `10PM` or `10:32PM`. */
export function formatCompactTime(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(d);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "";
  const period = (
    parts.find((p) => p.type === "dayPeriod")?.value ?? ""
  ).toUpperCase();
  if (minute === "00") return `${hour}${period}`;
  return `${hour}:${minute}${period}`;
}

/** Local calendar day key (`YYYY-MM-DD`) for grouping timeline rows. */
export function dayKey(at: number | Date): string {
  const d = typeof at === "number" ? new Date(at) : at;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Human day label: Today / Yesterday / Mon, Aug 10 (or with year). */
export function formatDayLabel(d: Date, now = new Date()): string {
  const today = dayKey(now);
  const key = dayKey(d);
  if (key === today) return "Today";

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (key === dayKey(yesterday)) return "Yesterday";

  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** Stable key for source-project + agent grouping in the timeline. */
export function activitySourceKey(line: ProjectActivityLine): string {
  return `${line.projectLabel}\0${line.agentName}`;
}

/**
 * Collapse each thread's source activity into burst notices: emit a line for
 * the first timed event, then again only after a quiet gap of ≥5 minutes.
 */
export function buildProjectActivityFeed(
  threads: AgentThreadRow[],
  catalog: SourceCatalogEntry[] = [],
): ProjectActivityLine[] {
  const lines: ProjectActivityLine[] = [];

  for (const thread of threads) {
    const title = thread.title || "Untitled thread";
    const projectLabel =
      resolveSourceProjectLabel(thread.projectContext, catalog) ??
      UNGROUPED_SOURCE_PROJECT_LABEL;
    const agentName = thread.lastAgentName.trim() || "Unknown agent";
    const timed = thread.sourceActivity
      .map((item, index) => {
        if (!item.timestamp) return null;
        const parsed = new Date(item.timestamp);
        if (Number.isNaN(parsed.getTime())) return null;
        return { index, at: parsed.getTime() };
      })
      .filter((row): row is { index: number; at: number } => row !== null)
      .sort((a, b) => a.at - b.at);

    let lastBurstAt = -Infinity;
    for (const row of timed) {
      if (row.at - lastBurstAt < ACTIVITY_GAP_MS) continue;
      lastBurstAt = row.at;
      lines.push({
        key: `${thread.id}-${row.index}-${row.at}`,
        timeLabel: formatCompactTime(new Date(row.at)),
        threadId: thread.id,
        threadTitle: title,
        projectLabel,
        agentName,
        sortAt: row.at,
      });
    }
  }

  return lines.sort((a, b) => a.sortAt - b.sortAt);
}
