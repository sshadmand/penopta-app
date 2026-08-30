import assert from "node:assert/strict";
import test from "node:test";

import { buildMcpStatsReport, type McpStatsSnapshot } from "./stats-report";
import type { ActivitySlice } from "../stats/activity";
import type { AttributedTurn } from "../stats/effort";

const NOW = new Date("2026-08-14T17:00:00.000Z");

function slice(
  partial: Partial<ActivitySlice> & Pick<ActivitySlice, "day" | "ownerUserId">,
): ActivitySlice {
  return {
    hour: 15,
    agentName: "cursor",
    agentModel: "gpt-5",
    projectContext: "penopta-app",
    threadId: "t-me",
    turns: 4,
    prompts: 1,
    tokens: 1000,
    ...partial,
  };
}

function turn(
  partial: Partial<AttributedTurn> &
    Pick<AttributedTurn, "day" | "ownerUserId">,
): AttributedTurn {
  return {
    hour: 15,
    agentName: "cursor",
    projectContext: "penopta-app",
    threadId: "t-me",
    tokens: 1000,
    prompts: 1,
    turns: 1,
    planKey: "casa_plan",
    planFileName: "CASA_PLAN.md",
    attribution: "named",
    ...partial,
  };
}

function fixture(): McpStatsSnapshot {
  return {
    slices: [
      slice({ day: "2026-08-14", ownerUserId: "u-me", tokens: 2000 }),
      slice({
        day: "2026-08-01",
        ownerUserId: "u-me",
        tokens: 500,
        threadId: "t-old",
      }),
      slice({
        day: "2026-08-14",
        ownerUserId: "u-other",
        tokens: 9000,
        threadId: "t-other",
        agentName: "claude",
      }),
    ],
    people: [
      { value: "u-me", label: "Sean" },
      { value: "u-other", label: "Alex" },
    ],
    agents: [
      { value: "cursor", label: "Cursor" },
      { value: "claude", label: "Claude" },
    ],
    projects: [{ value: "penopta-app", label: "penopta-app" }],
    planTurns: [
      turn({ day: "2026-08-14", ownerUserId: "u-me" }),
      turn({
        day: "2026-08-14",
        ownerUserId: "u-other",
        threadId: "t-other",
        agentName: "claude",
        planKey: "other_plan",
        planFileName: "OTHER_PLAN.md",
        tokens: 9000,
      }),
    ],
    threadProjects: [
      { threadId: "t-me", projectId: "p1", projectName: "Penopta" },
      { threadId: "t-other", projectId: "p2", projectName: "Other" },
    ],
  };
}

const owner = { ownerUserId: "u-me" };

test("defaults to the connected user's stats for the last 6 months", () => {
  const result = buildMcpStatsReport(
    fixture(),
    owner,
    {},
    { now: NOW, url: "https://app.example/analytics" },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.stats.person.id, "u-me");
  assert.equal(result.stats.overview.tokens, 2500);
  assert.equal(result.stats.effort.people?.[0]?.label, "Sean");
  assert.equal(result.stats.url, "https://app.example/analytics");
});

test("person=all includes the whole org", () => {
  const result = buildMcpStatsReport(
    fixture(),
    owner,
    { person: "all" },
    { now: NOW, url: "https://app.example/analytics" },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.stats.overview.tokens, 11500);
  assert.equal(result.stats.person.id, "all");
});

test("range 1w drops older days", () => {
  const result = buildMcpStatsReport(
    fixture(),
    owner,
    { range: "1w" },
    { now: NOW, url: "https://app.example/analytics" },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.stats.overview.tokens, 2000);
  assert.equal(result.stats.sinceDay, "2026-08-08");
});

test("filters by Penopta project name", () => {
  const result = buildMcpStatsReport(
    fixture(),
    owner,
    { person: "all", project: "Penopta" },
    { now: NOW, url: "https://app.example/analytics" },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.stats.project?.kind, "penopta");
  assert.equal(result.stats.overview.tokens, 2000);
});

test("unknown timezone is an error", () => {
  const result = buildMcpStatsReport(
    fixture(),
    owner,
    { timezone: "Not/AZone" },
    { now: NOW, url: "https://app.example/analytics" },
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /timezone/i);
});
