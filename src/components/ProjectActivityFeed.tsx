"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

import { CompactTime } from "@/components/LocalTime";
import type { ProjectActivityLine } from "@/lib/projects/activity-feed";

export type { ProjectActivityLine } from "@/lib/projects/activity-feed";
export {
  buildProjectActivityFeed,
  dayKey,
  formatCompactTime,
  formatDayLabel,
} from "@/lib/projects/activity-feed";

/** Single muted activity notice row (shared timeline styling). */
export function ProjectActivityRow({
  line,
  projectId,
  trailing,
}: {
  line: ProjectActivityLine;
  projectId: string;
  trailing?: ReactNode;
}) {
  return (
    <li className="flex min-w-0 items-center gap-2 text-xs text-muted mx-2">
      <CompactTime at={line.sortAt} className="w-16 shrink-0 tabular-nums" />
      <Link
        href={`/projects/${projectId}?thread=${line.threadId}`}
        className="min-w-0 flex-1 truncate transition hover:text-foreground"
        title={line.threadTitle}
      >
        {line.threadTitle}
      </Link>
      {trailing}
    </li>
  );
}

/**
 * Consecutive activity notices collapse to the first line + a count pill.
 * Click the pill to expand (and again to collapse).
 */
export function CollapsibleActivityGroup({
  lines,
  projectId,
}: {
  lines: ProjectActivityLine[];
  projectId: string;
}) {
  const [expanded, setExpanded] = useState(false);

  if (lines.length === 0) return null;

  if (lines.length === 1 || expanded) {
    return (
      <>
        {lines.map((line, index) => (
          <ProjectActivityRow
            key={line.key}
            line={line}
            projectId={projectId}
            trailing={
              lines.length > 1 && index === 0 ? (
                <ActivityCountPill
                  count={lines.length}
                  expanded
                  onClick={() => setExpanded(false)}
                />
              ) : null
            }
          />
        ))}
      </>
    );
  }

  return (
    <ProjectActivityRow
      line={lines[0]}
      projectId={projectId}
      trailing={
        <ActivityCountPill
          count={lines.length}
          expanded={false}
          onClick={() => setExpanded(true)}
        />
      }
    />
  );
}

function ActivityCountPill({
  count,
  expanded,
  onClick,
}: {
  count: number;
  expanded: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      title={expanded ? "Collapse activity" : `Show all ${count} activities`}
      className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-sidebar text-2xs font-semibold tabular-nums text-muted transition hover:bg-foreground/15"
    >
      {count}
    </button>
  );
}

/** Muted activity notice lines for the project main pane (not a thread view). */
export function ProjectActivityFeed({
  lines,
  projectId,
}: {
  lines: ProjectActivityLine[];
  projectId: string;
}) {
  if (lines.length === 0) return null;

  return (
    <ul className="mx-auto w-full max-w-3xl space-y-1.5">
      <CollapsibleActivityGroup lines={lines} projectId={projectId} />
    </ul>
  );
}
