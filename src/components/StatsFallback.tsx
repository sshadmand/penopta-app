import type { ReactNode } from "react";

import {
  CONTRIBUTION_LEVEL_CLASS,
  DEFAULT_STATS_RANGE,
  HEATMAP_WEEKDAY_LABELS,
  type StatsRange,
  heatmapDisplayRows,
  monthLabelsForWeeks,
  tokenUsageTitle,
} from "@/lib/stats/activity";
import { EFFORT_LENSES } from "@/lib/stats/effort";

function Pulse({
  className,
  style,
}: {
  className: string;
  style?: { width: string };
}) {
  return (
    <div
      className={`animate-pulse rounded-md bg-skeleton ${className}`}
      style={style}
    />
  );
}

function LoadingStatus({ label }: { label: string }) {
  return (
    <span role="status" className="sr-only">
      {label}
    </span>
  );
}

export function AnalyticsChrome({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto max-w-4xl px-8 py-10 sm:px-12">
      <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
      <p className="mt-1 text-sm text-muted">
        Agent activity in this workspace — time and estimated tokens on plans,
        projects, and agents.
      </p>
      {children}
    </main>
  );
}

const STAT_CARD_LABELS = [
  "Sessions",
  "Messages",
  "Total tokens",
  "Active days",
  "Current streak",
  "Longest streak",
  "Peak hour",
  "Avg tokens / day",
] as const;

const TABLE_ROWS = 11;
const TOKEN_BAR_WIDTHS = [92, 78, 64, 52, 41, 33, 26, 19, 13, 8];

function HeatmapRowSkeleton({ weeks }: { weeks: string[][] }) {
  if (weeks.length === 0) return null;

  return (
    <div className="w-full min-w-0">
      <div className="mb-1 flex gap-0.5">
        <div className="w-6 shrink-0" aria-hidden />
        {monthLabelsForWeeks(weeks).map((label, index) => (
          <div
            key={weeks[index]?.[0] ?? index}
            className="relative h-3 min-w-0 flex-1"
          >
            {label ? (
              <span className="absolute left-0 text-3xs whitespace-nowrap text-muted">
                {label}
              </span>
            ) : null}
          </div>
        ))}
      </div>
      <div className="flex gap-0.5">
        <div className="flex w-6 shrink-0 flex-col gap-0.5">
          {HEATMAP_WEEKDAY_LABELS.map((label, index) => (
            <div
              key={index}
              className="flex flex-1 items-center justify-end text-3xs text-muted"
            >
              {label}
            </div>
          ))}
        </div>
        {weeks.map((week, weekIndex) => (
          <div
            key={week[0] ?? weekIndex}
            className="flex min-w-0 flex-1 flex-col gap-0.5"
          >
            {week.map((day) => (
              <div
                key={day}
                className="aspect-square w-full rounded-sm bg-sidebar"
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function HeatmapSkeleton({ range }: { range: StatsRange }) {
  const rows = heatmapDisplayRows(new Date().toISOString().slice(0, 10), range);
  return (
    <div className="mt-4 flex min-w-0 flex-col gap-6">
      {rows.map((weeks) => (
        <HeatmapRowSkeleton key={weeks[0]?.[0] ?? "row"} weeks={weeks} />
      ))}
    </div>
  );
}

function HeatmapLegendSkeleton({ heatmapOnly }: { heatmapOnly: boolean }) {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
      {heatmapOnly ? <span /> : <Pulse className="h-3 w-full max-w-md" />}
      <div className="ml-auto flex items-center gap-1 text-2xs text-muted">
        <span>Less</span>
        {CONTRIBUTION_LEVEL_CLASS.map((cls, level) => (
          <span
            key={cls}
            className={`size-5 rounded-sm ${cls}`}
            aria-label={`Level ${level}`}
          />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}

function EffortTableSkeleton() {
  return (
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
              <th className="py-2 pr-3 text-right font-medium">Est. tokens</th>
              <th className="py-2 text-right font-medium">When</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: TABLE_ROWS }, (_, index) => (
              <tr key={index} className="border-b border-border/70">
                <td className="max-w-56 py-3 pr-3 flex flex-col gap-2">
                  <Pulse
                    className={`h-4 ${index % 3 === 0 ? "w-28" : "w-40"}`}
                  />
                  <Pulse
                    className={`h-2 ${index % 3 === 0 ? "w-40" : "w-9/10"}`}
                  />
                </td>
                <td className="py-2 pr-3">
                  <Pulse className="ml-auto h-4 w-6" />
                </td>
                <td className="py-2 pr-3">
                  <Pulse className="ml-auto h-4 w-8" />
                </td>
                <td className="py-2 pr-3">
                  <Pulse className="ml-auto h-4 w-12" />
                </td>
                <td className="py-2">
                  <Pulse className="ml-auto h-4 w-24" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function TokenBarChartSkeleton({ title }: { title: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold tracking-tight text-foreground">
        {title}
      </h3>
      <ul className="mt-3 space-y-3">
        {TOKEN_BAR_WIDTHS.map((width, index) => (
          <li key={index}>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <Pulse className={`h-3 ${index % 2 === 0 ? "w-28" : "w-20"}`} />
              <Pulse className="h-3 w-10" />
            </div>
            <div className="h-2.5 overflow-hidden rounded-sm bg-background">
              <Pulse
                className="h-2.5 rounded-sm"
                style={{ width: `${width}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EffortSkeleton() {
  return (
    <div className="mt-10">
      <h2 className="text-sm font-semibold tracking-tight text-foreground">
        Effort
      </h2>
      <div className="mt-3 flex flex-wrap gap-1">
        {EFFORT_LENSES.map((item, index) => (
          <span
            key={item.id}
            className={`inline-flex h-8 items-center rounded-md px-2.5 text-sm ${
              index === 0
                ? "bg-accent font-medium text-accent-foreground"
                : "border border-border bg-surface text-muted"
            }`}
          >
            {item.label}
          </span>
        ))}
      </div>
      <p className="mt-2 text-2xs text-muted">
        Plan files named in a prompt, or in the agent’s next reply when that
        reply names exactly one file. Short follow-ups, pastes, and attachments
        stay on that plan; a new prose ask does not.
      </p>
      <EffortTableSkeleton />
      <p className="mt-2 text-2xs text-muted">
        Days are unique calendar days with attributed turns, not the gap between
        first and last mention.
      </p>
      <div className="mt-8 space-y-8">
        <TokenBarChartSkeleton title="Estimated tokens by plan" />
        <div className="grid gap-8 sm:grid-cols-2">
          <TokenBarChartSkeleton title="Active days by plan" />
          <TokenBarChartSkeleton title="Threads by plan" />
        </div>
      </div>
      <p className="mt-3 text-2xs text-muted">
        Top 10 by tokens in this range. Tokens are estimated with a modern
        tokenizer.
      </p>
    </div>
  );
}

/** Matches ContributionGraph (+ Effort) so the page does not jump when data arrives. */
export function StatsGraphFallback({
  framed = true,
  variant = "full",
}: {
  framed?: boolean;
  variant?: "full" | "heatmap";
}) {
  const heatmapOnly = variant === "heatmap";
  const body = (
    <div aria-hidden>
      {heatmapOnly ? (
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm text-muted">{tokenUsageTitle("6m")}</p>
          <span className="text-xs text-muted">See all</span>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Pulse className="h-7 w-24" />
              <Pulse className="h-7 w-28" />
              <Pulse className="h-7 w-40" />
            </div>
            <Pulse className="h-7 w-28" />
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {STAT_CARD_LABELS.map((label) => (
              <div
                key={label}
                className="rounded-xl border border-border bg-background px-4 py-3"
              >
                <p className="text-2xs text-muted">{label}</p>
                <Pulse className="mt-1 h-7 w-16" />
              </div>
            ))}
          </div>
          <p className="mt-8 text-sm text-muted">
            {tokenUsageTitle(DEFAULT_STATS_RANGE)}
          </p>
        </>
      )}
      <HeatmapSkeleton range={heatmapOnly ? "6m" : DEFAULT_STATS_RANGE} />
      <HeatmapLegendSkeleton heatmapOnly={heatmapOnly} />
      {heatmapOnly ? null : <EffortSkeleton />}
    </div>
  );

  if (!framed) return body;

  return (
    <div className="mt-8 rounded-xl border border-border bg-surface p-5 sm:p-6">
      {body}
    </div>
  );
}

export function StatsChatFallback() {
  return (
    <section className="mt-10" aria-hidden>
      <h2 className="text-lg font-semibold tracking-tight">
        Ask about these stats
      </h2>
      <p className="mt-1 text-sm text-muted">
        Questions about tokens, plans, projects, and agents in this workspace.
      </p>
      <div className="mt-6 flex items-end gap-2 rounded-2xl border border-border bg-surface p-2">
        <Pulse className="min-h-10 flex-1 rounded-xl" />
        <Pulse className="h-9 w-9 rounded-xl" />
      </div>
    </section>
  );
}

export function AnalyticsFallback() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <AnalyticsChrome>
        <LoadingStatus label="Loading analytics" />
        <StatsGraphFallback />
        <StatsChatFallback />
      </AnalyticsChrome>
    </div>
  );
}
