"use client";

import { useMemo, useState } from "react";

import { AgentBrandIcon, agentBrandIcon } from "@/components/AgentBrandIcon";
import {
  type ActivitySlice,
  type StatsFilterOption,
  UNGROUPED_PROJECT_FILTER,
  formatAgentLabel,
  formatCompactCount,
  formatCount,
  parseLocalDay,
} from "@/lib/stats/activity";
import {
  EFFORT_LENSES,
  type AttributedTurn,
  type EffortLens,
  type EffortRow,
  type ThreadProjectLink,
  effortRowsForLens,
} from "@/lib/stats/effort";

function shortDay(day: string): string {
  if (!day) return "—";
  return parseLocalDay(day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function dateRange(firstDay: string, lastDay: string): string {
  if (!firstDay && !lastDay) return "—";
  if (!firstDay) return shortDay(lastDay);
  if (!lastDay || firstDay === lastDay) return shortDay(firstDay);
  return `${shortDay(firstDay)} – ${shortDay(lastDay)}`;
}

function chartLabel(label: string): string {
  return label
    .replace(/_PLAN\.md$/i, "")
    .replace(/-plan\.md$/i, "")
    .replace(/\.md$/i, "")
    .replace(/-/g, " ");
}

function lensNoun(lens: EffortLens): string {
  switch (lens) {
    case "plans":
      return "plan";
    case "features":
      return "feature";
    case "projects":
      return "workgroup";
    case "sources":
      return "source";
    case "agents":
      return "agent";
    case "people":
      return "person";
  }
}

function lensCaption(lens: EffortLens): string {
  switch (lens) {
    case "plans":
      return "Plan files named in a prompt, or in the agent’s next reply when that reply names exactly one file. Short follow-ups, pastes, and attachments stay on that plan; a new prose ask does not.";
    case "features":
      return "Related plans that share a prefix (for example CASA_*) are grouped. Singles stay as the plan file.";
    case "projects":
      return "Workgroups this thread is linked to. A thread in two workgroups counts in both.";
    case "sources":
      return "Provider projects the threads belonged to (Cursor, Claude, ChatGPT).";
    case "agents":
      return "Which agent produced the captured turns.";
    case "people":
      return "Who owns the synced threads.";
  }
}

function labelForSource(
  projectContext: string | null,
  projects: StatsFilterOption[],
): string {
  const key = projectContext?.trim() || UNGROUPED_PROJECT_FILTER;
  return (
    projects.find((item) => item.value === key)?.label ?? "No source project"
  );
}

/** Ranked effort for the current stats filters. */
export function EffortBreakdown({
  slices,
  turns,
  threadProjects,
  people,
  projects,
}: {
  slices: ActivitySlice[];
  turns: AttributedTurn[];
  threadProjects: ThreadProjectLink[];
  people: StatsFilterOption[];
  projects: StatsFilterOption[];
}) {
  const [lens, setLens] = useState<EffortLens>("plans");

  const threadProjectMap = useMemo(() => {
    const map = new Map<string, ThreadProjectLink[]>();
    for (const link of threadProjects) {
      const list = map.get(link.threadId);
      if (list) list.push(link);
      else map.set(link.threadId, [link]);
    }
    return map;
  }, [threadProjects]);

  const peopleLabel = useMemo(() => {
    const map = new Map(people.map((item) => [item.value, item.label]));
    return (id: string) => map.get(id) ?? id;
  }, [people]);

  const rows = useMemo(
    () =>
      effortRowsForLens(lens, {
        turns,
        slices,
        threadProjects: threadProjectMap,
        agentLabel: formatAgentLabel,
        sourceLabel: (ctx) => labelForSource(ctx, projects),
        personLabel: peopleLabel,
        ungroupedSourceKey: UNGROUPED_PROJECT_FILTER,
      }),
    [lens, turns, slices, threadProjectMap, projects, peopleLabel],
  );

  const showAttribution = lens === "plans" || lens === "features";

  return (
    <div className="mt-10">
      <h2 className="text-sm font-semibold tracking-tight text-foreground">
        Effort
      </h2>
      <div className="mt-3 flex flex-wrap gap-1">
        {EFFORT_LENSES.map((item) => {
          const active = item.id === lens;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setLens(item.id)}
              aria-pressed={active}
              className={`h-8 rounded-md px-2.5 text-sm transition ${
                active
                  ? "bg-accent font-medium text-accent-foreground"
                  : "border border-border bg-surface text-muted hover:text-foreground"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-2xs text-muted">{lensCaption(lens)}</p>

      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted">
          Nothing in this range for {lens}.
        </p>
      ) : (
        <>
          <h3 className="mt-6 text-sm font-semibold tracking-tight text-foreground">
            Days, threads, and date range
          </h3>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-md text-left text-sm">
              <thead>
                <tr className="border-b border-border text-2xs font-medium tracking-wide text-muted uppercase">
                  <th className="py-2 pr-3 font-medium">Name</th>
                  <th className="py-2 pr-3 text-right font-medium">Days</th>
                  <th className="py-2 pr-3 text-right font-medium">Threads</th>
                  <th className="py-2 pr-3 text-right font-medium">
                    Est. tokens
                  </th>
                  <th className="py-2 text-right font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <EffortTableRow
                    key={row.key}
                    row={row}
                    showAttribution={showAttribution}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-2xs text-muted">
            Days are unique calendar days with attributed turns, not the gap
            between first and last mention.
          </p>

          <div className="mt-8 space-y-8">
            <EffortBarChart
              title={`Estimated tokens by ${lensNoun(lens)}`}
              rows={rows}
              value={(row) => row.tokens}
              format={formatCompactCount}
            />
            <div className="grid gap-8 sm:grid-cols-2">
              <EffortBarChart
                title={`Active days by ${lensNoun(lens)}`}
                rows={rows}
                value={(row) => row.days}
                format={formatCount}
              />
              <EffortBarChart
                title={`Threads by ${lensNoun(lens)}`}
                rows={rows}
                value={(row) => row.threads}
                format={formatCount}
              />
            </div>
          </div>
          <p className="mt-3 text-2xs text-muted">
            Top 10 by tokens in this range. Tokens are estimated with a modern
            tokenizer.
          </p>
        </>
      )}
    </div>
  );
}

function EffortAgentIcon({ agentName }: { agentName: string }) {
  const label = formatAgentLabel(agentName);
  if (!agentBrandIcon(agentName)) {
    return (
      <span
        title={label}
        className="inline-flex size-2.5 items-center justify-center text-3xs leading-none text-muted"
      >
        {label.charAt(0) || "?"}
      </span>
    );
  }
  return (
    <span title={label}>
      <AgentBrandIcon agentName={agentName} className="size-2.5 opacity-60" />
    </span>
  );
}

function EffortTableRow({
  row,
  showAttribution,
}: {
  row: EffortRow;
  showAttribution: boolean;
}) {
  const hasAttribution =
    showAttribution && (row.namedTokens > 0 || row.inheritedTokens > 0);
  const agents = showAttribution ? row.agents : [];
  const showSubtext = hasAttribution || agents.length > 0;

  return (
    <tr className="border-b border-border/70">
      <td className="max-w-56 py-2 pr-3">
        <p className="truncate font-medium text-foreground" title={row.label}>
          {row.label}
        </p>
        {showSubtext ? (
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
            {agents.length > 0 ? (
              <span
                className="flex shrink-0 items-center gap-0.5"
                aria-label={agents.map(formatAgentLabel).join(", ")}
              >
                {agents.map((agent) => (
                  <EffortAgentIcon key={agent} agentName={agent} />
                ))}
              </span>
            ) : null}
            {hasAttribution ? (
              <p className="min-w-0 truncate text-2xs text-muted">
                {formatCompactCount(row.namedTokens)} named
                {row.inheritedTokens > 0
                  ? ` · ${formatCompactCount(row.inheritedTokens)} continue`
                  : ""}
              </p>
            ) : null}
          </div>
        ) : null}
      </td>
      <td className="py-2 pr-3 text-right tabular-nums text-foreground">
        {formatCount(row.days)}
      </td>
      <td className="py-2 pr-3 text-right tabular-nums text-foreground">
        {formatCount(row.threads)}
      </td>
      <td className="py-2 pr-3 text-right tabular-nums text-foreground">
        {formatCompactCount(row.tokens)}
      </td>
      <td className="py-2 text-right whitespace-nowrap text-muted">
        {dateRange(row.firstDay, row.lastDay)}
      </td>
    </tr>
  );
}

function EffortBarChart({
  title,
  rows,
  value,
  format,
}: {
  title: string;
  rows: EffortRow[];
  value: (row: EffortRow) => number;
  format: (n: number) => string;
}) {
  const chartRows = rows.slice(0, 10);
  const max = Math.max(...chartRows.map(value), 1);

  return (
    <div>
      <h3 className="text-sm font-semibold tracking-tight text-foreground">
        {title}
      </h3>
      <ul className="mt-3 space-y-3">
        {chartRows.map((row) => {
          const n = value(row);
          const pct = n <= 0 ? 0 : Math.max(2, Math.round((n / max) * 100));
          const name = chartLabel(row.label);
          return (
            <li key={row.key}>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span
                  className="truncate text-2xs text-muted"
                  title={row.label}
                >
                  {name}
                </span>
                <span className="shrink-0 text-2xs tabular-nums text-foreground">
                  {format(n)}
                </span>
              </div>
              <div
                className="h-2.5 overflow-hidden rounded-sm bg-background"
                role="img"
                aria-label={`${row.label}: ${format(n)}`}
              >
                <div
                  className="h-2.5 rounded-sm bg-foreground"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
