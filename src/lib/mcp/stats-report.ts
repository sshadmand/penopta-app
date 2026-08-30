import {
  type ActivitySlice,
  type StatsFilterOption,
  type StatsRange,
  DEFAULT_STATS_RANGE,
  UNGROUPED_PROJECT_FILTER,
  filterSlices,
  formatAgentLabel,
  formatHourLabel,
  isValidTimeZone,
  overviewStats,
  rangeStartDay,
  todayInTimeZone,
  toTimeZoneSlices,
  totalsByDay,
} from "@/lib/stats/activity";
import {
  type AttributedTurn,
  type EffortLens,
  type EffortRow,
  type ThreadProjectLink,
  EFFORT_LENSES,
  effortRowsForLens,
  filterAttributedTurns,
  toTimeZoneAttributedTurns,
  uniquePenoptaProjects,
} from "@/lib/stats/effort";

export const MCP_STATS_RANGE_IDS = [
  "1d",
  "3d",
  "1w",
  "1m",
  "3m",
  "6m",
  "1y",
] as const satisfies readonly StatsRange[];

export const MCP_STATS_LENS_IDS: EffortLens[] = EFFORT_LENSES.map(
  (item) => item.id,
);

export type McpStatsSnapshot = {
  slices: ActivitySlice[];
  people: StatsFilterOption[];
  agents: StatsFilterOption[];
  projects: StatsFilterOption[];
  planTurns: AttributedTurn[];
  threadProjects: ThreadProjectLink[];
};

export type McpStatsInput = {
  range?: StatsRange;
  /** `me` (default), `all` for the org, or a person id/name. */
  person?: string;
  agent?: string;
  /** Workgroup id/slug/name, or a source (provider) project name. */
  project?: string;
  /** IANA timezone. Default UTC. */
  timezone?: string;
  lens?: EffortLens | "all";
  limit?: number;
};

export type McpEffortRow = EffortRow;

export type McpStatsReport = {
  range: StatsRange;
  timezone: string;
  sinceDay: string;
  untilDay: string;
  person: { id: string; label: string };
  agent: { id: string; label: string } | null;
  project: {
    id: string;
    label: string;
    kind: "penopta" | "source";
  } | null;
  overview: {
    sessions: number;
    messages: number;
    tokens: number;
    activeDays: number;
    currentStreak: number;
    longestStreak: number;
    peakHour: number | null;
    peakHourLabel: string | null;
    tokensPerDay: number;
  };
  effort: Partial<Record<EffortLens, McpEffortRow[]>>;
  busiestDays: {
    day: string;
    tokens: number;
    turns: number;
    prompts: number;
  }[];
  available: {
    people: StatsFilterOption[];
    agents: StatsFilterOption[];
    projects: StatsFilterOption[];
  };
  url: string;
  notes: string[];
};

export type McpStatsResult =
  { ok: true; stats: McpStatsReport } | { ok: false; error: string };

export type BuildMcpStatsOpts = {
  now?: Date;
  penoptaProject?: { id: string; name: string } | null;
  url: string;
};

const DEFAULT_TIMEZONE = "UTC";
const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 25;
const BUSIEST_DAYS = 7;

function clampLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit))
    return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(limit)));
}

function matchOption(
  options: StatsFilterOption[],
  raw: string,
  noun: string,
): { option: StatsFilterOption } | { error: string } {
  const q = raw.trim().toLowerCase();
  if (!q) return { error: `No ${noun} matching "${raw}".` };

  const valueExact = options.filter((item) => item.value.toLowerCase() === q);
  if (valueExact.length === 1 && valueExact[0]) {
    return { option: valueExact[0] };
  }
  const labelExact = options.filter((item) => item.label.toLowerCase() === q);
  if (labelExact.length === 1 && labelExact[0]) {
    return { option: labelExact[0] };
  }

  const partial = options.filter(
    (item) =>
      item.label.toLowerCase().includes(q) ||
      item.value.toLowerCase().includes(q),
  );
  if (partial.length === 1 && partial[0]) return { option: partial[0] };
  if (partial.length > 1) {
    const names = partial
      .slice(0, 5)
      .map((item) => item.label)
      .join(", ");
    return {
      error: `Multiple ${noun} match "${raw}": ${names}. Be more specific.`,
    };
  }
  return { error: `No ${noun} matching "${raw}".` };
}

function isAllPerson(raw: string): boolean {
  return ["all", "org", "workspace", "*", "everyone"].includes(raw);
}

function isMePerson(raw: string): boolean {
  return ["me", "self", "myself", "i"].includes(raw);
}

function threadProjectMap(
  links: ThreadProjectLink[],
): Map<string, ThreadProjectLink[]> {
  const map = new Map<string, ThreadProjectLink[]>();
  for (const link of links) {
    const list = map.get(link.threadId);
    if (list) list.push(link);
    else map.set(link.threadId, [link]);
  }
  return map;
}

function capRows(rows: EffortRow[], limit: number): EffortRow[] {
  return rows.slice(0, limit);
}

/**
 * Roll loaded org activity into a compact stats report for MCP.
 * Tokens stay estimated (o200k_base); this is not provider billing.
 */
export function buildMcpStatsReport(
  stats: McpStatsSnapshot,
  owner: { ownerUserId: string },
  input: McpStatsInput,
  opts: BuildMcpStatsOpts,
): McpStatsResult {
  const timezone = input.timezone?.trim() || DEFAULT_TIMEZONE;
  if (!isValidTimeZone(timezone)) {
    return {
      ok: false,
      error: `Unknown timezone "${timezone}". Use an IANA name like America/Los_Angeles.`,
    };
  }

  const range = input.range ?? DEFAULT_STATS_RANGE;
  const limit = clampLimit(input.limit);
  const lens = input.lens ?? "all";
  const now = opts.now ?? new Date();
  const today = todayInTimeZone(timezone, now);
  const sinceDay = rangeStartDay(today, range);
  const url = opts.url;

  const personRaw = input.person?.trim() || "me";
  let ownerUserId: string | null = owner.ownerUserId;
  let personMeta: { id: string; label: string } = {
    id: owner.ownerUserId,
    label:
      stats.people.find((item) => item.value === owner.ownerUserId)?.label ??
      "You",
  };

  if (isAllPerson(personRaw.toLowerCase())) {
    ownerUserId = null;
    personMeta = { id: "all", label: "All people" };
  } else if (!isMePerson(personRaw.toLowerCase())) {
    const matched = matchOption(stats.people, personRaw, "people");
    if ("error" in matched) return { ok: false, error: matched.error };
    ownerUserId = matched.option.value;
    personMeta = { id: matched.option.value, label: matched.option.label };
  }

  let agentFilter: string | null = null;
  let agentMeta: { id: string; label: string } | null = null;
  if (input.agent?.trim()) {
    const matched = matchOption(stats.agents, input.agent, "agents");
    if ("error" in matched) return { ok: false, error: matched.error };
    agentFilter = matched.option.value;
    agentMeta = { id: matched.option.value, label: matched.option.label };
  }

  let sourceFilter: string | null | undefined = undefined;
  let threadIds: Set<string> | null = null;
  let projectMeta: McpStatsReport["project"] = null;
  const projectRaw = input.project?.trim();

  if (projectRaw) {
    if (opts.penoptaProject) {
      threadIds = new Set(
        stats.threadProjects
          .filter((link) => link.projectId === opts.penoptaProject?.id)
          .map((link) => link.threadId),
      );
      projectMeta = {
        id: opts.penoptaProject.id,
        label: opts.penoptaProject.name,
        kind: "penopta",
      };
    } else {
      const penoptaMatch = matchOption(
        uniquePenoptaProjects(stats.threadProjects),
        projectRaw,
        "projects",
      );
      const sourceMatch = matchOption(stats.projects, projectRaw, "sources");
      if (!("error" in penoptaMatch)) {
        threadIds = new Set(
          stats.threadProjects
            .filter((link) => link.projectId === penoptaMatch.option.value)
            .map((link) => link.threadId),
        );
        projectMeta = {
          id: penoptaMatch.option.value,
          label: penoptaMatch.option.label,
          kind: "penopta",
        };
      } else if (!("error" in sourceMatch)) {
        sourceFilter =
          sourceMatch.option.value === UNGROUPED_PROJECT_FILTER
            ? ""
            : sourceMatch.option.value;
        projectMeta = {
          id: sourceMatch.option.value,
          label: sourceMatch.option.label,
          kind: "source",
        };
      } else {
        return {
          ok: false,
          error: `No visible project or source matching "${projectRaw}".`,
        };
      }
    }
  }

  const slices = toTimeZoneSlices(stats.slices, timezone);
  const turns = toTimeZoneAttributedTurns(stats.planTurns, timezone);
  const identity = {
    ownerUserId,
    agentName: agentFilter,
    projectContext: sourceFilter,
    sinceDay,
    untilDay: today,
  };
  let filteredSlices = filterSlices(slices, identity);
  let filteredTurns = filterAttributedTurns(turns, identity);
  const projectThreadIds = threadIds;
  if (projectThreadIds) {
    filteredSlices = filteredSlices.filter((slice) =>
      projectThreadIds.has(slice.threadId),
    );
    filteredTurns = filteredTurns.filter((turn) =>
      projectThreadIds.has(turn.threadId),
    );
  }

  const overview = overviewStats(filteredSlices, today);
  const byDay = totalsByDay(filteredSlices);
  const busiestDays = [...byDay.values()]
    .sort((a, b) => b.tokens - a.tokens || b.day.localeCompare(a.day))
    .slice(0, BUSIEST_DAYS)
    .map((row) => ({
      day: row.day,
      tokens: row.tokens,
      turns: row.turns,
      prompts: row.prompts,
    }));

  const peopleLabel = (id: string) =>
    stats.people.find((item) => item.value === id)?.label ??
    (id === owner.ownerUserId ? "You" : id);
  const sourceLabel = (projectContext: string | null) => {
    const key = projectContext?.trim() || UNGROUPED_PROJECT_FILTER;
    return (
      stats.projects.find((item) => item.value === key)?.label ??
      "No source project"
    );
  };
  const links = threadProjectMap(stats.threadProjects);
  const lensOpts = {
    turns: filteredTurns,
    slices: filteredSlices,
    threadProjects: links,
    agentLabel: formatAgentLabel,
    sourceLabel,
    personLabel: peopleLabel,
    ungroupedSourceKey: UNGROUPED_PROJECT_FILTER,
  };

  const effort: Partial<Record<EffortLens, McpEffortRow[]>> = {};
  const lenses: EffortLens[] = lens === "all" ? MCP_STATS_LENS_IDS : [lens];
  for (const id of lenses) {
    effort[id] = capRows(effortRowsForLens(id, lensOpts), limit);
  }

  return {
    ok: true,
    stats: {
      range,
      timezone,
      sinceDay,
      untilDay: today,
      person: personMeta,
      agent: agentMeta,
      project: projectMeta,
      overview: {
        ...overview,
        peakHourLabel:
          overview.peakHour == null ? null : formatHourLabel(overview.peakHour),
      },
      effort,
      busiestDays,
      available: {
        people: stats.people,
        agents: stats.agents,
        projects: stats.projects,
      },
      url,
      notes: [
        "Tokens are estimated from captured transcript text (o200k_base), not provider billing.",
        "Days and hours use the requested timezone (default UTC). Pass an IANA name to match the in-app heatmap.",
        "A thread linked to two workgroups counts in both when grouping by workgroup.",
      ],
    },
  };
}
