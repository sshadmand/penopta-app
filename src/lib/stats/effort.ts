import {
  type ActivityFilters,
  type ActivitySlice,
  type StatsFilterOption,
  matchesActivityFilters,
  projectKey,
  utcDayHourInTimeZone,
  utcDayHourToLocal,
} from "@/lib/stats/activity";
import { planFeatureKey, type PlanAttribution } from "@/lib/stats/plan-spans";

export type EffortLens =
  "plans" | "features" | "projects" | "sources" | "agents" | "people";

export const EFFORT_LENSES: { id: EffortLens; label: string }[] = [
  { id: "plans", label: "Plans" },
  { id: "features", label: "Features" },
  { id: "projects", label: "Workgroups" },
  { id: "sources", label: "Sources" },
  { id: "agents", label: "Agents" },
  { id: "people", label: "People" },
];

export type AttributedTurn = {
  day: string;
  hour: number;
  ownerUserId: string;
  agentName: string;
  projectContext: string | null;
  threadId: string;
  tokens: number;
  prompts: number;
  turns: number;
  planKey: string | null;
  planFileName: string | null;
  attribution: PlanAttribution | null;
};

export type ThreadProjectLink = {
  threadId: string;
  projectId: string;
  projectName: string;
};

/** Distinct workgroups represented in thread links, sorted by name. */
export function uniquePenoptaProjects(
  links: ThreadProjectLink[],
): StatsFilterOption[] {
  const seen = new Map<string, string>();
  for (const link of links) {
    if (!seen.has(link.projectId)) seen.set(link.projectId, link.projectName);
  }
  return [...seen.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export type EffortRow = {
  key: string;
  label: string;
  days: number;
  tokens: number;
  threads: number;
  prompts: number;
  firstDay: string;
  lastDay: string;
  namedTokens: number;
  inheritedTokens: number;
  /** Unique agent names, most tokens first. */
  agents: string[];
};

type Acc = {
  label: string;
  days: Set<string>;
  tokens: number;
  threads: Set<string>;
  prompts: number;
  firstDay: string;
  lastDay: string;
  namedTokens: number;
  inheritedTokens: number;
  agentTokens: Map<string, number>;
};

function emptyAcc(label: string): Acc {
  return {
    label,
    days: new Set(),
    tokens: 0,
    threads: new Set(),
    prompts: 0,
    firstDay: "",
    lastDay: "",
    namedTokens: 0,
    inheritedTokens: 0,
    agentTokens: new Map(),
  };
}

function add(
  map: Map<string, Acc>,
  key: string,
  label: string,
  turn: Pick<
    AttributedTurn,
    "day" | "tokens" | "threadId" | "prompts" | "attribution" | "agentName"
  >,
) {
  let acc = map.get(key);
  if (!acc) {
    acc = emptyAcc(label);
    map.set(key, acc);
  }
  acc.days.add(turn.day);
  acc.tokens += turn.tokens;
  acc.threads.add(turn.threadId);
  acc.prompts += turn.prompts;
  if (!acc.firstDay || turn.day < acc.firstDay) acc.firstDay = turn.day;
  if (turn.day > acc.lastDay) acc.lastDay = turn.day;
  if (turn.attribution === "named") acc.namedTokens += turn.tokens;
  if (turn.attribution === "inherited") acc.inheritedTokens += turn.tokens;
  const agent = turn.agentName.trim();
  if (agent) {
    acc.agentTokens.set(agent, (acc.agentTokens.get(agent) ?? 0) + turn.tokens);
  }
}

function agentsForAcc(acc: Acc): string[] {
  return [...acc.agentTokens.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name]) => name);
}

function toRows(map: Map<string, Acc>): EffortRow[] {
  const rows: EffortRow[] = [];
  for (const [key, acc] of map) {
    rows.push({
      key,
      label: acc.label,
      days: acc.days.size,
      tokens: acc.tokens,
      threads: acc.threads.size,
      prompts: acc.prompts,
      firstDay: acc.firstDay,
      lastDay: acc.lastDay,
      namedTokens: acc.namedTokens,
      inheritedTokens: acc.inheritedTokens,
      agents: agentsForAcc(acc),
    });
  }
  rows.sort((a, b) => b.tokens - a.tokens || a.label.localeCompare(b.label));
  return rows;
}

function addSlice(
  map: Map<string, Acc>,
  key: string,
  label: string,
  slice: ActivitySlice,
) {
  add(map, key, label, {
    day: slice.day,
    tokens: slice.tokens,
    threadId: slice.threadId,
    prompts: slice.prompts,
    attribution: null,
    agentName: slice.agentName,
  });
}

/** Plan-file effort from named + short-inherit turns only. */
export function effortByPlan(turns: AttributedTurn[]): EffortRow[] {
  const map = new Map<string, Acc>();
  for (const turn of turns) {
    if (!turn.planKey || !turn.planFileName) continue;
    add(map, turn.planKey, turn.planFileName, turn);
  }
  return toRows(map);
}

/**
 * Related plans sharing a prefix (`CASA_*`) roll up. A prefix used once
 * stays the individual plan name.
 */
export function effortByFeature(turns: AttributedTurn[]): EffortRow[] {
  const byPlan = effortByPlan(turns);
  const prefixCounts = new Map<string, number>();
  for (const row of byPlan) {
    const prefix = planFeatureKey(row.key);
    prefixCounts.set(prefix, (prefixCounts.get(prefix) ?? 0) + 1);
  }

  const map = new Map<string, Acc>();
  for (const turn of turns) {
    if (!turn.planKey || !turn.planFileName) continue;
    const prefix = planFeatureKey(turn.planKey);
    const grouped = (prefixCounts.get(prefix) ?? 0) >= 2;
    const key = grouped ? prefix : turn.planKey;
    const label = grouped ? prefix : turn.planFileName;
    add(map, key, label, turn);
  }
  return toRows(map);
}

export function effortByAgent(
  slices: ActivitySlice[],
  agentLabel: (name: string) => string,
): EffortRow[] {
  const map = new Map<string, Acc>();
  for (const slice of slices) {
    addSlice(map, slice.agentName, agentLabel(slice.agentName), slice);
  }
  return toRows(map);
}

export function effortBySource(
  slices: ActivitySlice[],
  sourceLabel: (projectContext: string | null) => string,
  ungroupedKey: string,
): EffortRow[] {
  const map = new Map<string, Acc>();
  for (const slice of slices) {
    const key = projectKey(slice.projectContext) || ungroupedKey;
    addSlice(map, key, sourceLabel(slice.projectContext), slice);
  }
  return toRows(map);
}

export function effortByPerson(
  slices: ActivitySlice[],
  personLabel: (ownerUserId: string) => string,
): EffortRow[] {
  const map = new Map<string, Acc>();
  for (const slice of slices) {
    addSlice(map, slice.ownerUserId, personLabel(slice.ownerUserId), slice);
  }
  return toRows(map);
}

export function effortByPenoptaProject(
  slices: ActivitySlice[],
  threadProjects: Map<string, ThreadProjectLink[]>,
): EffortRow[] {
  const map = new Map<string, Acc>();
  for (const slice of slices) {
    const links = threadProjects.get(slice.threadId) ?? [];
    if (links.length === 0) {
      addSlice(map, "__none__", "No workgroup", slice);
      continue;
    }
    for (const link of links) {
      addSlice(map, link.projectId, link.projectName, slice);
    }
  }
  return toRows(map);
}

export function effortRowsForLens(
  lens: EffortLens,
  opts: {
    turns: AttributedTurn[];
    slices: ActivitySlice[];
    threadProjects: Map<string, ThreadProjectLink[]>;
    agentLabel: (name: string) => string;
    sourceLabel: (projectContext: string | null) => string;
    personLabel: (ownerUserId: string) => string;
    ungroupedSourceKey: string;
  },
): EffortRow[] {
  switch (lens) {
    case "plans":
      return effortByPlan(opts.turns);
    case "features":
      return effortByFeature(opts.turns);
    case "projects":
      return effortByPenoptaProject(opts.slices, opts.threadProjects);
    case "sources":
      return effortBySource(
        opts.slices,
        opts.sourceLabel,
        opts.ungroupedSourceKey,
      );
    case "agents":
      return effortByAgent(opts.slices, opts.agentLabel);
    case "people":
      return effortByPerson(opts.slices, opts.personLabel);
  }
}

export function toLocalAttributedTurns(
  turns: AttributedTurn[],
): AttributedTurn[] {
  return turns.flatMap((turn) => {
    const local = utcDayHourToLocal(turn.day, turn.hour);
    if (!local) return [];
    return [{ ...turn, day: local.day, hour: local.hour }];
  });
}

/** Rebucket attributed turns into an IANA timezone (MCP stats). */
export function toTimeZoneAttributedTurns(
  turns: AttributedTurn[],
  timeZone: string,
): AttributedTurn[] {
  return turns.flatMap((turn) => {
    const zoned = utcDayHourInTimeZone(turn.day, turn.hour, timeZone);
    if (!zoned) return [];
    return [{ ...turn, day: zoned.day, hour: zoned.hour }];
  });
}

export function filterAttributedTurns(
  turns: AttributedTurn[],
  filters: ActivityFilters,
): AttributedTurn[] {
  return turns.filter((turn) => matchesActivityFilters(turn, filters));
}
