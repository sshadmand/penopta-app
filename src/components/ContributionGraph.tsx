"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { EffortBreakdown } from "@/components/EffortBreakdown";
import { StatsGraphFallback } from "@/components/StatsFallback";
import {
  type ActivitySlice,
  type DayTotals,
  type StatsFilterOption,
  type StatsRange,
  CONTRIBUTION_LEVEL_CLASS,
  DEFAULT_STATS_RANGE,
  STATS_RANGES,
  UNGROUPED_PROJECT_FILTER,
  HEATMAP_WEEKDAY_LABELS,
  buildCalendarWeeks,
  contributionLevel,
  filterSlices,
  formatCompactCount,
  formatCount,
  formatDayLabel,
  formatHourLabel,
  heatmapDisplayRows,
  intensityThresholds,
  monthLabelsForWeeks,
  parseLocalDay,
  overviewStats,
  rangeStartDay,
  toLocalSlices,
  tokenUsageTitle,
  totalsByDay,
} from "@/lib/stats/activity";
import {
  type AttributedTurn,
  type ThreadProjectLink,
  filterAttributedTurns,
  toLocalAttributedTurns,
  uniquePenoptaProjects,
} from "@/lib/stats/effort";
import { useLocalToday } from "@/lib/use-hydrated";

type DaySelection = { anchor: string; extent: string };

function orderedDayRange(a: string, b: string): { start: string; end: string } {
  return a <= b ? { start: a, end: b } : { start: b, end: a };
}

function shortDayLabel(day: string): string {
  return parseLocalDay(day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatSelectionLabel(start: string, end: string): string {
  if (start === end) return formatDayLabel(start);
  return `${shortDayLabel(start)} – ${shortDayLabel(end)}`;
}

function selectionUsageTitle(start: string, end: string): string {
  if (start === end) return `Token usage on ${formatDayLabel(start)}`;
  return `Token usage ${formatSelectionLabel(start, end)}`;
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-background px-4 py-3">
      <p className="text-2xs text-muted">{label}</p>
      <p className="mt-1 truncate text-xl font-semibold tracking-tight tabular-nums text-foreground">
        {value}
      </p>
    </div>
  );
}

function HeatmapDayButton({
  day,
  label,
  selected,
  className,
  value,
  noun,
  onDayClick,
}: {
  day: string;
  label: string;
  selected: boolean;
  className: string;
  value: number;
  noun: string;
  onDayClick: (day: string, shiftKey: boolean) => void;
}) {
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!tip) return;
    const hide = () => setTip(null);
    window.addEventListener("scroll", hide, true);
    return () => window.removeEventListener("scroll", hide, true);
  }, [tip]);

  function place(el: HTMLElement) {
    const rect = el.getBoundingClientRect();
    setTip({ x: rect.left + rect.width / 2, y: rect.top });
  }

  return (
    <button
      type="button"
      data-day-square=""
      aria-label={label}
      aria-pressed={selected}
      onPointerEnter={(event) => place(event.currentTarget)}
      onPointerLeave={() => setTip(null)}
      onFocus={(event) => place(event.currentTarget)}
      onBlur={() => setTip(null)}
      onMouseDown={(event) => {
        if (event.shiftKey) event.preventDefault();
      }}
      onClick={(event) => onDayClick(day, event.shiftKey)}
      className={className}
    >
      {tip
        ? createPortal(
            <span
              role="tooltip"
              className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-surface px-2 py-1 text-left text-xs whitespace-nowrap text-foreground shadow-lg"
              style={{ left: tip.x, top: tip.y - 4 }}
            >
              <span className="block">{formatDayLabel(day)}</span>
              <span className="block text-2xs text-muted">
                {formatCount(value)} {noun}
              </span>
            </span>,
            document.body,
          )
        : null}
    </button>
  );
}

function HeatmapRow({
  weeks,
  startDay,
  endDay,
  today,
  yearStart,
  selectedStart,
  selectedEnd,
  byDay,
  thresholds,
  onDayClick,
}: {
  weeks: string[][];
  startDay: string;
  endDay: string;
  today: string;
  yearStart: string;
  selectedStart: string | null;
  selectedEnd: string | null;
  byDay: Map<string, DayTotals>;
  thresholds: [number, number, number];
  onDayClick?: (day: string, shiftKey: boolean) => void;
}) {
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
            {week.map((day) => {
              const inRange = day >= startDay && day <= endDay;
              const selectable = day >= yearStart && day <= today;
              const selected = Boolean(
                selectedStart &&
                selectedEnd &&
                day >= selectedStart &&
                day <= selectedEnd,
              );
              const value = byDay.get(day)?.tokens ?? 0;
              const level = contributionLevel(value, thresholds);
              const noun = value === 1 ? "token" : "tokens";
              const className = `aspect-square w-full rounded-sm border-0 p-0 ${CONTRIBUTION_LEVEL_CLASS[level]} ${
                inRange ? "" : "opacity-30"
              } ${selected ? "ring-1 ring-inset ring-foreground" : ""}`;

              if (!selectable || !onDayClick) {
                return <div key={day} className={className} />;
              }

              return (
                <HeatmapDayButton
                  key={day}
                  day={day}
                  label={`${formatCount(value)} ${noun} on ${formatDayLabel(day)}`}
                  selected={selected}
                  className={className}
                  value={value}
                  noun={noun}
                  onDayClick={onDayClick}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  allLabel,
  value,
  options,
  onChange,
}: {
  label: string;
  allLabel: string;
  value: string;
  options: StatsFilterOption[];
  onChange: (value: string) => void;
}) {
  if (options.length < 2 && !value) return null;

  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 min-w-0 max-w-48 rounded-md border border-border bg-surface px-2 text-sm text-foreground outline-none transition focus:border-accent"
    >
      <option value="">{allLabel}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/** GitHub-style year heatmap of captured agent activity. */
export function ContributionGraph({
  slices,
  people,
  agents,
  projects,
  planTurns = [],
  threadProjects = [],
  initialPenoptaProjectId = "",
  variant = "full",
}: {
  slices: ActivitySlice[];
  people: StatsFilterOption[];
  agents: StatsFilterOption[];
  projects: StatsFilterOption[];
  planTurns?: AttributedTurn[];
  threadProjects?: ThreadProjectLink[];
  initialPenoptaProjectId?: string;
  /** `heatmap` is the 6-month grid only (home). */
  variant?: "full" | "heatmap";
}) {
  const penoptaProjects = useMemo(
    () => uniquePenoptaProjects(threadProjects),
    [threadProjects],
  );
  const [range, setRange] = useState<StatsRange>(
    variant === "heatmap" ? "6m" : DEFAULT_STATS_RANGE,
  );
  const [selection, setSelection] = useState<DaySelection | null>(null);
  const [ownerUserId, setOwnerUserId] = useState("");
  const [agentName, setAgentName] = useState("");
  const [projectContext, setProjectContext] = useState("");
  const [penoptaProjectId, setPenoptaProjectId] = useState(() =>
    penoptaProjects.some((item) => item.value === initialPenoptaProjectId)
      ? initialPenoptaProjectId
      : "",
  );
  const today = useLocalToday();

  useEffect(() => {
    if (variant === "heatmap" || !selection) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-day-square]")) {
        return;
      }
      setSelection(null);
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [selection, variant]);

  const localSlices = useMemo(() => toLocalSlices(slices), [slices]);
  const localTurns = useMemo(
    () => toLocalAttributedTurns(planTurns),
    [planTurns],
  );
  const projectThreadIds = useMemo(() => {
    if (!penoptaProjectId) return null;
    return new Set(
      threadProjects
        .filter((link) => link.projectId === penoptaProjectId)
        .map((link) => link.threadId),
    );
  }, [penoptaProjectId, threadProjects]);
  const scopedSlices = useMemo(() => {
    if (!projectThreadIds) return localSlices;
    return localSlices.filter((slice) => projectThreadIds.has(slice.threadId));
  }, [localSlices, projectThreadIds]);
  const scopedTurns = useMemo(() => {
    if (!projectThreadIds) return localTurns;
    return localTurns.filter((turn) => projectThreadIds.has(turn.threadId));
  }, [localTurns, projectThreadIds]);
  const yearStart = useMemo(
    () => (today ? rangeStartDay(today, "1y") : ""),
    [today],
  );
  const rangeStart = useMemo(
    () => (today ? rangeStartDay(today, range) : ""),
    [today, range],
  );
  const selectedRange = selection
    ? orderedDayRange(selection.anchor, selection.extent)
    : null;
  const startDay =
    selection == null
      ? rangeStart
      : selection.anchor <= selection.extent
        ? selection.anchor
        : selection.extent;
  const endDay =
    selection == null
      ? today
      : selection.anchor <= selection.extent
        ? selection.extent
        : selection.anchor;
  const weeks = useMemo(
    () => (today && yearStart ? buildCalendarWeeks(today, yearStart) : []),
    [today, yearStart],
  );
  const heatmapRows = useMemo(
    () => heatmapDisplayRows(today, range),
    [today, range],
  );

  const identityFilters = useMemo(
    () => ({
      ownerUserId: ownerUserId || null,
      agentName: agentName || null,
      projectContext:
        projectContext === ""
          ? null
          : projectContext === UNGROUPED_PROJECT_FILTER
            ? ""
            : projectContext,
    }),
    [ownerUserId, agentName, projectContext],
  );

  const activityFilters = useMemo(
    () =>
      today
        ? { ...identityFilters, sinceDay: startDay, untilDay: endDay }
        : null,
    [identityFilters, startDay, endDay, today],
  );

  const yearFilters = useMemo(
    () =>
      today && yearStart
        ? { ...identityFilters, sinceDay: yearStart, untilDay: today }
        : null,
    [identityFilters, yearStart, today],
  );

  const filtered = useMemo(
    () => (activityFilters ? filterSlices(scopedSlices, activityFilters) : []),
    [scopedSlices, activityFilters],
  );

  const filteredTurns = useMemo(
    () =>
      activityFilters
        ? filterAttributedTurns(scopedTurns, activityFilters)
        : [],
    [scopedTurns, activityFilters],
  );

  const yearSlices = useMemo(
    () => (yearFilters ? filterSlices(scopedSlices, yearFilters) : []),
    [scopedSlices, yearFilters],
  );

  const byDay = useMemo(() => totalsByDay(yearSlices), [yearSlices]);
  const overview = useMemo(
    () => overviewStats(filtered, endDay),
    [filtered, endDay],
  );

  const thresholds = useMemo(() => {
    const values: number[] = [];
    for (const week of weeks) {
      for (const day of week) {
        if (day < yearStart || day > today) continue;
        values.push(byDay.get(day)?.tokens ?? 0);
      }
    }
    return intensityThresholds(values);
  }, [weeks, yearStart, today, byDay]);

  const showFilters =
    people.length >= 2 ||
    agents.length >= 2 ||
    projects.length >= 2 ||
    penoptaProjects.length >= 2 ||
    Boolean(penoptaProjectId);

  if (!today) {
    return <StatsGraphFallback framed={false} variant={variant} />;
  }

  const heatmapOnly = variant === "heatmap";

  return (
    <div>
      {heatmapOnly ? null : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {showFilters ? (
              <>
                <FilterSelect
                  label="Person"
                  allLabel="All people"
                  value={ownerUserId}
                  options={people}
                  onChange={setOwnerUserId}
                />
                <FilterSelect
                  label="Agent"
                  allLabel="All agents"
                  value={agentName}
                  options={agents}
                  onChange={setAgentName}
                />
                <FilterSelect
                  label="Workgroup"
                  allLabel="All workgroups"
                  value={penoptaProjectId}
                  options={penoptaProjects}
                  onChange={setPenoptaProjectId}
                />
                <FilterSelect
                  label="Source"
                  allLabel="All sources"
                  value={projectContext}
                  options={projects}
                  onChange={setProjectContext}
                />
              </>
            ) : null}
            <select
              aria-label="Range"
              value={selectedRange ? "__day__" : range}
              onChange={(e) => {
                setSelection(null);
                if (e.target.value !== "__day__") {
                  setRange(e.target.value as StatsRange);
                }
              }}
              className="ml-auto h-8 rounded-md border border-border bg-surface px-2 text-sm text-foreground outline-none transition focus:border-accent"
            >
              {selectedRange ? (
                <option value="__day__">
                  {formatSelectionLabel(selectedRange.start, selectedRange.end)}
                </option>
              ) : null}
              {STATS_RANGES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Sessions" value={formatCount(overview.sessions)} />
            <StatCard label="Messages" value={formatCount(overview.messages)} />
            <StatCard
              label="Total tokens"
              value={formatCompactCount(overview.tokens)}
            />
            <StatCard
              label="Active days"
              value={formatCount(overview.activeDays)}
            />
            <StatCard
              label="Current streak"
              value={`${overview.currentStreak}d`}
            />
            <StatCard
              label="Longest streak"
              value={`${overview.longestStreak}d`}
            />
            <StatCard
              label="Peak hour"
              value={
                overview.peakHour == null
                  ? "—"
                  : formatHourLabel(overview.peakHour)
              }
            />
            <StatCard
              label="Avg tokens / day"
              value={formatCompactCount(overview.tokensPerDay)}
            />
          </div>
        </>
      )}

      {heatmapOnly ? (
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm text-muted">{tokenUsageTitle("6m")}</p>
          <span className="text-xs text-muted transition hover:text-foreground">
            See all
          </span>
        </div>
      ) : (
        <p className="mt-8 text-sm text-muted">
          {selectedRange
            ? selectionUsageTitle(selectedRange.start, selectedRange.end)
            : tokenUsageTitle(range)}
        </p>
      )}

      <div className="mt-4 flex min-w-0 select-none flex-col gap-6">
        {heatmapRows.map((rowWeeks) => (
          <HeatmapRow
            key={rowWeeks[0]?.[0] ?? "row"}
            weeks={rowWeeks}
            startDay={startDay}
            endDay={endDay}
            today={today}
            yearStart={yearStart}
            selectedStart={selectedRange?.start ?? null}
            selectedEnd={selectedRange?.end ?? null}
            byDay={byDay}
            thresholds={thresholds}
            onDayClick={
              heatmapOnly
                ? undefined
                : (day, shiftKey) => {
                    setSelection((current) => {
                      if (shiftKey && current) {
                        return { anchor: current.anchor, extent: day };
                      }
                      if (
                        !shiftKey &&
                        current &&
                        current.anchor === day &&
                        current.extent === day
                      ) {
                        return null;
                      }
                      return { anchor: day, extent: day };
                    });
                  }
            }
          />
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {heatmapOnly ? (
          <span />
        ) : (
          <p className="text-2xs text-muted">
            Estimated with{" "}
            <a
              href="https://github.com/openai/js-tiktoken"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 no-underline"
            >
              js-tiktoken
            </a>
            . Results can vary. Provider usage is not stored.
          </p>
        )}
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

      {heatmapOnly ? null : (
        <EffortBreakdown
          slices={filtered}
          turns={filteredTurns}
          threadProjects={threadProjects}
          people={people}
          projects={projects}
        />
      )}
    </div>
  );
}
