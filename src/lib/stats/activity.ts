/** How far back the contribution graph looks. */
export const STATS_RANGES = [
  { id: "1d", label: "1 day", period: "day" },
  { id: "3d", label: "3 days", period: "3 days" },
  { id: "1w", label: "1 week", period: "week" },
  { id: "1m", label: "1 month", period: "month" },
  { id: "3m", label: "3 months", period: "3 months" },
  { id: "6m", label: "6 months", period: "6 months" },
  { id: "1y", label: "1 year", period: "year" },
] as const;

export type StatsRange = (typeof STATS_RANGES)[number]["id"];

export const DEFAULT_STATS_RANGE: StatsRange = "6m";

/** One day's activity for a person × agent × source-project slice. */
export type ActivitySlice = {
  day: string;
  /** 0–23 hour of the bucket (UTC from the server; local after `toLocalSlices`). */
  hour: number;
  ownerUserId: string;
  agentName: string;
  agentModel: string;
  projectContext: string | null;
  threadId: string;
  turns: number;
  prompts: number;
  tokens: number;
};

export type StatsFilterOption = { value: string; label: string };

export type DayTotals = {
  day: string;
  turns: number;
  prompts: number;
  tokens: number;
};

export type ActivityFilters = {
  ownerUserId?: string | null;
  agentName?: string | null;
  projectContext?: string | null;
  /** Inclusive local `YYYY-MM-DD`. */
  sinceDay?: string | null;
  /** Inclusive local `YYYY-MM-DD`. */
  untilDay?: string | null;
};

/** Source-project bucket for threads with no `project_context`. */
export const UNGROUPED_PROJECT_KEY = "";

/** Select value for the ungrouped project filter (All uses empty string). */
export const UNGROUPED_PROJECT_FILTER = "__none__";

export function projectKey(projectContext: string | null | undefined): string {
  return projectContext?.trim() || UNGROUPED_PROJECT_KEY;
}

export function matchesActivityFilters(
  row: {
    ownerUserId: string;
    agentName: string;
    projectContext: string | null;
    day: string;
  },
  filters: ActivityFilters,
): boolean {
  const owner = filters.ownerUserId?.trim() || null;
  const agent = filters.agentName?.trim() || null;
  const project =
    filters.projectContext === undefined ? null : filters.projectContext;
  const since = filters.sinceDay?.trim() || null;
  const until = filters.untilDay?.trim() || null;

  if (owner && row.ownerUserId !== owner) return false;
  if (agent && row.agentName !== agent) return false;
  if (project !== null && projectKey(row.projectContext) !== project) {
    return false;
  }
  if (since && row.day < since) return false;
  if (until && row.day > until) return false;
  return true;
}

export function filterSlices(
  slices: ActivitySlice[],
  filters: ActivityFilters,
): ActivitySlice[] {
  return slices.filter((slice) => matchesActivityFilters(slice, filters));
}

export function sumTotals(slices: ActivitySlice[]): Omit<DayTotals, "day"> {
  let turns = 0;
  let prompts = 0;
  let tokens = 0;
  for (const slice of slices) {
    turns += slice.turns;
    prompts += slice.prompts;
    tokens += slice.tokens;
  }
  return { turns, prompts, tokens };
}

export function totalsByDay(slices: ActivitySlice[]): Map<string, DayTotals> {
  const byDay = new Map<string, DayTotals>();
  for (const slice of slices) {
    const existing = byDay.get(slice.day);
    if (existing) {
      existing.turns += slice.turns;
      existing.prompts += slice.prompts;
      existing.tokens += slice.tokens;
    } else {
      byDay.set(slice.day, {
        day: slice.day,
        turns: slice.turns,
        prompts: slice.prompts,
        tokens: slice.tokens,
      });
    }
  }
  return byDay;
}

/** Local calendar `YYYY-MM-DD`. */
export function localDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Rebucket a UTC day+hour into the viewer's local calendar. */
export function utcDayHourToLocal(
  day: string,
  hour: number,
): { day: string; hour: number } | null {
  const clamped = Math.min(23, Math.max(0, hour));
  const utc = new Date(`${day}T${pad2(clamped)}:00:00.000Z`);
  if (Number.isNaN(utc.getTime())) return null;
  return { day: localDayKey(utc), hour: utc.getHours() };
}

/** True when `timeZone` is a valid IANA name (`UTC`, `America/Los_Angeles`). */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Calendar `YYYY-MM-DD` for `now` in an IANA timezone. */
export function todayInTimeZone(
  timeZone: string,
  now: Date = new Date(),
): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Rebucket a UTC day+hour into an IANA timezone calendar. */
export function utcDayHourInTimeZone(
  day: string,
  hour: number,
  timeZone: string,
): { day: string; hour: number } | null {
  const clamped = Math.min(23, Math.max(0, hour));
  const utc = new Date(`${day}T${pad2(clamped)}:00:00.000Z`);
  if (Number.isNaN(utc.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(utc);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  const year = get("year");
  const month = get("month");
  const date = get("day");
  const hourPart = get("hour");
  if (!year || !month || !date || hourPart == null) return null;
  return { day: `${year}-${month}-${date}`, hour: Number(hourPart) };
}

function mergeRebinnedSlices(
  slices: ActivitySlice[],
  rebin: (day: string, hour: number) => { day: string; hour: number } | null,
): ActivitySlice[] {
  const merged = new Map<string, ActivitySlice>();
  for (const slice of slices) {
    const binned = rebin(slice.day, slice.hour);
    if (!binned) continue;
    const key = [
      binned.day,
      binned.hour,
      slice.ownerUserId,
      slice.agentName,
      slice.agentModel,
      projectKey(slice.projectContext),
      slice.threadId,
    ].join("\0");
    const existing = merged.get(key);
    if (existing) {
      existing.turns += slice.turns;
      existing.prompts += slice.prompts;
      existing.tokens += slice.tokens;
    } else {
      merged.set(key, { ...slice, day: binned.day, hour: binned.hour });
    }
  }
  return [...merged.values()];
}

export function parseLocalDay(day: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, date ?? 1, 12, 0, 0);
}

function addLocalDays(day: string, days: number): string {
  const date = parseLocalDay(day);
  date.setDate(date.getDate() + days);
  return localDayKey(date);
}

/** Consecutive local days ending on `endDay`, oldest first. */
export function localDaysEndingOn(endDay: string, count: number): string[] {
  const days: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    days.push(addLocalDays(endDay, -i));
  }
  return days;
}

/** UTC hour bucket used by the project-header activity strip. */
export type ActivityBucket = { day: string; hour: number; value: number };

export function mergeActivityBuckets(
  buckets: ActivityBucket[],
): ActivityBucket[] {
  const merged = new Map<string, ActivityBucket>();
  for (const bucket of buckets) {
    const key = `${bucket.day}\0${bucket.hour}`;
    const existing = merged.get(key);
    if (existing) existing.value += bucket.value;
    else merged.set(key, { ...bucket });
  }
  return [...merged.values()];
}

/** Rebucket UTC hour buckets into the viewer's local calendar. */
export function toLocalActivityBuckets(
  buckets: ActivityBucket[],
): ActivityBucket[] {
  const local: ActivityBucket[] = [];
  for (const bucket of buckets) {
    const binned = utcDayHourToLocal(bucket.day, bucket.hour);
    if (!binned) continue;
    local.push({ day: binned.day, hour: binned.hour, value: bucket.value });
  }
  return mergeActivityBuckets(local);
}

export function valuesByDay(buckets: ActivityBucket[]): Map<string, number> {
  const byDay = new Map<string, number>();
  for (const bucket of buckets) {
    byDay.set(bucket.day, (byDay.get(bucket.day) ?? 0) + bucket.value);
  }
  return byDay;
}

export const ACTIVITY_PREVIEW_DAYS = 5;

export type ActivityPreviewDay = {
  day: string;
  value: number;
  level: 0 | 1 | 2 | 3 | 4;
};

/** Last `count` local days, colored with the same intensity scale as the heatmap. */
export function activityPreviewDays(
  values: Map<string, number>,
  today: string,
  count = ACTIVITY_PREVIEW_DAYS,
): ActivityPreviewDay[] {
  const days = localDaysEndingOn(today, count);
  const thresholds = intensityThresholds([...values.values()]);
  return days.map((day) => {
    const value = values.get(day) ?? 0;
    return { day, value, level: contributionLevel(value, thresholds) };
  });
}

export const CONTRIBUTION_LEVEL_CLASS = [
  "bg-contrib-0",
  "bg-contrib-1",
  "bg-contrib-2",
  "bg-contrib-3",
  "bg-contrib-4",
] as const;

/**
 * Rebucket UTC day+hour slices into the viewer's local calendar.
 * Call this on the client before range filters and rollups.
 */
export function toLocalSlices(slices: ActivitySlice[]): ActivitySlice[] {
  return mergeRebinnedSlices(slices, utcDayHourToLocal);
}

/**
 * Rebucket UTC day+hour slices into an IANA timezone calendar.
 * Used by MCP stats so answers can match the viewer's heatmap, not the server.
 */
export function toTimeZoneSlices(
  slices: ActivitySlice[],
  timeZone: string,
): ActivitySlice[] {
  return mergeRebinnedSlices(slices, (day, hour) =>
    utcDayHourInTimeZone(day, hour, timeZone),
  );
}

const RANGE_DAYS: Partial<Record<StatsRange, number>> = {
  "1d": 1,
  "3d": 3,
  "1w": 7,
};

const RANGE_MONTHS: Partial<Record<StatsRange, number>> = {
  "1m": 1,
  "3m": 3,
  "6m": 6,
  "1y": 12,
};

/** First local day included in a range ending on `endDay`. */
export function rangeStartDay(endDay: string, range: StatsRange): string {
  const days = RANGE_DAYS[range];
  if (days) return addLocalDays(endDay, -(days - 1));

  const months = RANGE_MONTHS[range] ?? 12;
  const start = parseLocalDay(endDay);
  start.setMonth(start.getMonth() - months);
  return localDayKey(start);
}

export function tokenUsageTitle(range: StatsRange): string {
  const period =
    STATS_RANGES.find((item) => item.id === range)?.period ?? "year";
  return `Token usage in the last ${period}`;
}

/**
 * Sunday-start weeks covering `startDay` through `endDay` (local).
 * The first column may include a few days before `startDay` so weekdays line up.
 */
export function buildCalendarWeeks(
  endDay: string,
  startDay: string,
): string[][] {
  const origin = parseLocalDay(startDay);
  origin.setDate(origin.getDate() - origin.getDay());
  let cursor = localDayKey(origin);

  const weeks: string[][] = [];
  while (cursor <= endDay) {
    const week: string[] = [];
    for (let d = 0; d < 7; d += 1) {
      week.push(cursor);
      cursor = addLocalDays(cursor, 1);
    }
    weeks.push(week);
  }
  return weeks;
}

export const HEATMAP_WEEKDAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];

/**
 * Heatmap rows for a range: one 6-month band, or two stacked bands for `1y`.
 * Empty when `today` is unset (SSR / pre-hydration).
 */
export function heatmapDisplayRows(
  today: string,
  range: StatsRange,
): string[][][] {
  if (!today) return [];
  const yearStart = rangeStartDay(today, "1y");
  const weeks = buildCalendarWeeks(today, yearStart);
  const midDay = rangeStartDay(today, "6m");
  const split = weeks.findIndex((week) => week.some((day) => day >= midDay));
  if (split <= 0) return [weeks];
  const recent = weeks.slice(split);
  if (range !== "1y") return [recent];
  return [weeks.slice(0, split), recent];
}

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** Month abbreviation over the first week that contains the 1st of a month. */
export function monthLabelForWeek(days: string[]): string | null {
  const first = days.find((day) => day.endsWith("-01"));
  if (!first) return null;
  return MONTH_LABELS[parseLocalDay(first).getMonth()] ?? null;
}

/**
 * Month labels for each week, skipping a label when it would collide with
 * the previous one (cells are too narrow for back-to-back names).
 */
export function monthLabelsForWeeks(weeks: string[][]): (string | null)[] {
  const labels = weeks.map(monthLabelForWeek);
  let lastIndex = -99;
  return labels.map((label, index) => {
    if (!label) return null;
    if (index - lastIndex < 2) return null;
    lastIndex = index;
    return label;
  });
}

/**
 * Quartile cutoffs of non-zero values so a few spike days don't flatten
 * the rest of the year. Returns thresholds for levels 2, 3, and 4.
 */
export function intensityThresholds(
  values: number[],
): [number, number, number] {
  const nonzero = values.filter((v) => v > 0).sort((a, b) => a - b);
  if (nonzero.length === 0) return [1, 2, 3];
  const at = (q: number) =>
    nonzero[
      Math.min(nonzero.length - 1, Math.floor(q * (nonzero.length - 1)))
    ] ?? 1;
  const q1 = Math.max(1, at(0.25));
  const q2 = Math.max(q1 + 1, at(0.5));
  const q3 = Math.max(q2 + 1, at(0.75));
  return [q1, q2, q3];
}

export function contributionLevel(
  value: number,
  thresholds: [number, number, number],
): 0 | 1 | 2 | 3 | 4 {
  if (value <= 0) return 0;
  if (value <= thresholds[0]) return 1;
  if (value <= thresholds[1]) return 2;
  if (value <= thresholds[2]) return 3;
  return 4;
}

export function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

export function formatDayLabel(day: string): string {
  return parseLocalDay(day).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** Compact counts for large totals (`13.2M`, `267k`). */
export function formatCompactCount(n: number): string {
  if (n >= 1_000_000) {
    const millions = n / 1_000_000;
    const digits = millions >= 10 ? 0 : 1;
    return `${millions.toFixed(digits).replace(/\.0$/, "")}M`;
  }
  if (n >= 10_000) {
    const thousands = n / 1_000;
    const digits = thousands >= 100 ? 0 : 1;
    return `${thousands.toFixed(digits).replace(/\.0$/, "")}k`;
  }
  return formatCount(n);
}

/** `10` → `10 AM` (hour is already local). */
export function formatHourLabel(hour: number): string {
  const clamped = Math.min(23, Math.max(0, Math.round(hour)));
  return new Date(2020, 0, 1, clamped).toLocaleTimeString("en-US", {
    hour: "numeric",
  });
}

export type OverviewStats = {
  sessions: number;
  messages: number;
  tokens: number;
  activeDays: number;
  currentStreak: number;
  longestStreak: number;
  peakHour: number | null;
  tokensPerDay: number;
};

function uniqueActiveDays(slices: ActivitySlice[]): string[] {
  const days = new Set<string>();
  for (const slice of slices) {
    if (slice.turns > 0) days.add(slice.day);
  }
  return [...days].sort();
}

function currentStreak(activeDays: Set<string>, today: string): number {
  let cursor = today;
  if (!activeDays.has(cursor)) cursor = addLocalDays(today, -1);
  let streak = 0;
  while (activeDays.has(cursor)) {
    streak += 1;
    cursor = addLocalDays(cursor, -1);
  }
  return streak;
}

function longestStreak(days: string[]): number {
  if (days.length === 0) return 0;
  let best = 1;
  let run = 1;
  for (let i = 1; i < days.length; i += 1) {
    const prev = days[i - 1];
    const day = days[i];
    if (!prev || !day) continue;
    if (addLocalDays(prev, 1) === day) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 1;
    }
  }
  return best;
}

/** Roll up filtered slices into the overview cards. */
export function overviewStats(
  slices: ActivitySlice[],
  today: string,
): OverviewStats {
  const threads = new Set<string>();
  const hourTurns = new Map<number, number>();
  let messages = 0;
  let tokens = 0;

  for (const slice of slices) {
    messages += slice.turns;
    tokens += slice.tokens;
    if (slice.threadId) threads.add(slice.threadId);
    hourTurns.set(slice.hour, (hourTurns.get(slice.hour) ?? 0) + slice.turns);
  }

  const days = uniqueActiveDays(slices);
  const active = new Set(days);

  let peakHour: number | null = null;
  let peakTurns = 0;
  for (const [hour, turns] of hourTurns) {
    if (turns > peakTurns) {
      peakTurns = turns;
      peakHour = hour;
    }
  }

  return {
    sessions: threads.size,
    messages,
    tokens,
    activeDays: days.length,
    currentStreak: currentStreak(active, today),
    longestStreak: longestStreak(days),
    peakHour: peakTurns > 0 ? peakHour : null,
    tokensPerDay: days.length === 0 ? 0 : Math.round(tokens / days.length),
  };
}

/** `claude-code` → `Claude code`. */
export function formatAgentLabel(agentName: string): string {
  const spaced = agentName.replace(/[-_]+/g, " ").trim();
  if (!spaced) return agentName;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
