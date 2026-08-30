import type { AgentThreadRow, SourceActivityItem } from "@/lib/db/schema";
import { resolveSourceProjectLabel } from "@/lib/integrations/provider-projects-view";
import { UNGROUPED_SOURCE_PROJECT_LABEL } from "@/lib/threads/group";
import { isAgentRole, isHumanRole, withoutLeadUp } from "@/lib/threads/lead-up";

/** Soft cap so a continuation brief stays cheaper than a full `/summary` dump. */
const MAX_CONTEXT_CHARS = 40_000;
const MAX_HUMAN_TURNS_PER_THREAD = 8;
const MAX_TURN_CHARS = 600;

export type SourceProjectCatalogEntry = { name: string; projectId: string };

export type SourceProjectThreadGroup = {
  label: string;
  threads: AgentThreadRow[];
};

function clipTurn(text: string): string {
  const t = text.trim();
  if (t.length <= MAX_TURN_CHARS) return t;
  return `${t.slice(0, MAX_TURN_CHARS - 1)}…`;
}

function lastHumanTurns(items: SourceActivityItem[]): SourceActivityItem[] {
  return items
    .filter((item) => isHumanRole(item.role))
    .slice(-MAX_HUMAN_TURNS_PER_THREAD);
}

function lastAgentTurn(items: SourceActivityItem[]): SourceActivityItem | null {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i];
    if (item && isAgentRole(item.role)) return item;
  }
  return null;
}

/** Group linked threads by source (provider) project label. */
export function groupThreadsBySourceProject(
  threads: AgentThreadRow[],
  catalog: SourceProjectCatalogEntry[] = [],
): SourceProjectThreadGroup[] {
  const byLabel = new Map<string, AgentThreadRow[]>();

  for (const thread of threads) {
    const label =
      resolveSourceProjectLabel(thread.projectContext, catalog) ??
      UNGROUPED_SOURCE_PROJECT_LABEL;
    const bucket = byLabel.get(label);
    if (bucket) bucket.push(thread);
    else byLabel.set(label, [thread]);
  }

  return Array.from(byLabel.entries()).map(([label, grouped]) => ({
    label,
    threads: grouped,
  }));
}

/** Case-insensitive match on source-project label (substring). */
export function filterSourceProjectGroups(
  groups: SourceProjectThreadGroup[],
  filter: string | null | undefined,
): SourceProjectThreadGroup[] {
  const needle = filter?.trim().toLowerCase();
  if (!needle) return groups;
  return groups.filter((g) => g.label.toLowerCase().includes(needle));
}

function formatThreadForContinue(thread: AgentThreadRow): string {
  const title = thread.title || "Untitled thread";
  const agent = thread.lastAgentName || thread.kind || "agent";
  const ws = thread.workingState;
  const lines = [`### Thread: ${title} (${agent}, ${thread.status})`];

  if (ws?.objective?.trim()) {
    lines.push(`Working-state objective: ${ws.objective.trim()}`);
  }
  if (ws?.nextAction?.trim()) {
    lines.push(`Working-state next action: ${ws.nextAction.trim()}`);
  }
  if (ws?.openQuestions?.length) {
    lines.push(`Open questions: ${ws.openQuestions.join("; ")}`);
  }
  if (ws?.completedWork?.length) {
    lines.push(
      `Already done (do not repeat in the next prompt): ${ws.completedWork.join("; ")}`,
    );
  }

  const activity = withoutLeadUp(thread.sourceActivity);
  const humanTurns = lastHumanTurns(activity);
  if (humanTurns.length > 0) {
    lines.push("Recent human turns (the work they were driving):");
    for (const m of humanTurns) {
      const when = m.timestamp ?? "unknown time";
      lines.push(`[${when}] ${m.role}: ${clipTurn(m.text)}`);
    }
  }

  const leftover = lastAgentTurn(activity);
  if (leftover) {
    lines.push(
      `Last agent turn (final reply, lead-up omitted): [${leftover.timestamp ?? "unknown time"}] ${clipTurn(leftover.text)}`,
    );
  }

  if (
    !ws?.objective?.trim() &&
    !ws?.nextAction?.trim() &&
    humanTurns.length === 0
  ) {
    lines.push("(no human objective or turns captured)");
  }

  lines.push("");
  return lines.join("\n");
}

export type ContinueWorkContextBundle = {
  text: string;
  sourceProjectCount: number;
  threadCount: number;
  truncated: boolean;
  /** Labels after filtering; empty when the filter matched nothing. */
  sourceProjectLabels: string[];
};

/**
 * Build prompt context grouped by source project, weighted toward human
 * turns and current working-state objectives — not full transcripts.
 * Lead-up assistant turns are omitted.
 */
export function buildContinueWorkContext(opts: {
  projectName: string;
  threads: AgentThreadRow[];
  catalog?: SourceProjectCatalogEntry[];
  sourceProjectFilter?: string | null;
}): ContinueWorkContextBundle {
  const groups = filterSourceProjectGroups(
    groupThreadsBySourceProject(opts.threads, opts.catalog ?? []),
    opts.sourceProjectFilter,
  );

  const header = [
    `Workgroup "${opts.projectName}".`,
    "Grouped by source (provider) project. Prefer human turns over agent recap.",
    "",
  ].join("\n");

  const parts: string[] = [header];
  let used = header.length;
  let truncated = false;
  let threadCount = 0;

  for (const group of groups) {
    const groupHeader = `## Source project: ${group.label}\n\n`;
    if (used + groupHeader.length > MAX_CONTEXT_CHARS) {
      truncated = true;
      break;
    }
    parts.push(groupHeader);
    used += groupHeader.length;

    for (const thread of group.threads) {
      const block = formatThreadForContinue(thread);
      if (used + block.length > MAX_CONTEXT_CHARS) {
        truncated = true;
        const remaining = Math.max(0, MAX_CONTEXT_CHARS - used - 80);
        if (remaining > 0) {
          parts.push(block.slice(0, remaining) + "\n…[truncated]");
        }
        return {
          text: parts.join("\n"),
          sourceProjectCount: groups.length,
          threadCount: threadCount + 1,
          truncated: true,
          sourceProjectLabels: groups.map((g) => g.label),
        };
      }
      parts.push(block);
      used += block.length;
      threadCount += 1;
    }
  }

  return {
    text: parts.join("\n"),
    sourceProjectCount: groups.length,
    threadCount,
    truncated,
    sourceProjectLabels: groups.map((g) => g.label),
  };
}
