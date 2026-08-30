import assert from "node:assert/strict";
import test from "node:test";

import {
  SOURCE_RANK_CURRENT,
  SOURCE_RANK_SNAPSHOT,
  activityTurnsFromSources,
  filterSinceDay,
  rollupFromSources,
  threadSourceFingerprint,
  toPlanSlices,
  type RollupSource,
} from "./rollup";
import { effortByPlan } from "./effort";

function source(
  partial: Partial<RollupSource> & Pick<RollupSource, "sourceActivity">,
): RollupSource {
  return {
    threadId: "t1",
    ownerUserId: "u1",
    agentName: "cursor",
    agentModel: "gpt-5",
    projectContext: "penopta-app",
    threadUpdatedAt: "2026-08-14T12:00:00.000Z",
    sourceRank: SOURCE_RANK_CURRENT,
    ...partial,
  };
}

const NAMED_PLAN = "Please follow CASA_READINESS_PLAN.md";

test("threadSourceFingerprint changes when transcript or snapshots change", () => {
  const base = threadSourceFingerprint({
    activityHash: "aaa",
    projectContext: "app",
    agentName: "cursor",
    agentModel: "gpt-5",
    snapshotCount: 1,
    snapshotMaxAt: "2026-08-14T00:00:00.000Z",
  });
  assert.notEqual(
    base,
    threadSourceFingerprint({
      activityHash: "bbb",
      projectContext: "app",
      agentName: "cursor",
      agentModel: "gpt-5",
      snapshotCount: 1,
      snapshotMaxAt: "2026-08-14T00:00:00.000Z",
    }),
  );
  assert.notEqual(
    base,
    threadSourceFingerprint({
      activityHash: "aaa",
      projectContext: "app",
      agentName: "claude",
      agentModel: "gpt-5",
      snapshotCount: 1,
      snapshotMaxAt: "2026-08-14T00:00:00.000Z",
    }),
  );
  assert.notEqual(
    base,
    threadSourceFingerprint({
      activityHash: "aaa",
      projectContext: "app",
      agentName: "cursor",
      agentModel: "gpt-5",
      snapshotCount: 2,
      snapshotMaxAt: "2026-08-14T00:00:00.000Z",
    }),
  );
});

test("duplicate snapshot turns count once", () => {
  const activity = [
    {
      timestamp: "2026-08-14T10:00:00.000Z",
      role: "user",
      text: "hello there",
    },
    {
      timestamp: "2026-08-14T10:01:00.000Z",
      role: "assistant",
      text: "hi back",
    },
  ];
  const { slices } = rollupFromSources([
    source({ sourceActivity: activity, sourceRank: SOURCE_RANK_CURRENT }),
    source({ sourceActivity: activity, sourceRank: SOURCE_RANK_SNAPSHOT }),
    source({ sourceActivity: activity, sourceRank: SOURCE_RANK_SNAPSHOT }),
  ]);
  assert.equal(slices.length, 1);
  assert.equal(slices[0]?.turns, 2);
  assert.equal(slices[0]?.prompts, 1);
});

test("current row wins dedupe ties so a project rename sticks", () => {
  const activity = [
    {
      timestamp: "2026-08-14T10:00:00.000Z",
      role: "user",
      text: "same turn",
    },
  ];
  const { slices } = rollupFromSources([
    source({
      sourceActivity: activity,
      projectContext: "new-name",
      sourceRank: SOURCE_RANK_CURRENT,
    }),
    source({
      sourceActivity: activity,
      projectContext: "old-name",
      sourceRank: SOURCE_RANK_SNAPSHOT,
    }),
  ]);
  assert.equal(slices[0]?.projectContext, "new-name");
});

test("missing timestamps fill in order and still bucket", () => {
  const turns = activityTurnsFromSources([
    source({
      sourceActivity: [
        { timestamp: "2026-08-14T10:00:00.000Z", role: "user", text: "one" },
        { timestamp: null, role: "assistant", text: "two" },
      ],
    }),
  ]);
  assert.equal(turns.length, 2);
  assert.equal(turns[1]?.ts, "2026-08-14T10:00:01.000Z");
  assert.equal(turns[1]?.hour, 10);
});

test("plan slices aggregate same-hour turns without changing effort totals", () => {
  const turns = activityTurnsFromSources([
    source({
      sourceActivity: [
        {
          timestamp: "2026-08-14T10:00:00.000Z",
          role: "user",
          text: NAMED_PLAN,
        },
        {
          timestamp: "2026-08-14T10:01:00.000Z",
          role: "assistant",
          text: "Working on it.",
        },
        {
          timestamp: "2026-08-14T10:02:00.000Z",
          role: "user",
          text: "continue",
        },
        {
          timestamp: "2026-08-14T10:03:00.000Z",
          role: "assistant",
          text: "Done.",
        },
      ],
    }),
  ]);
  const slices = toPlanSlices(turns);
  assert.ok(slices.length > 0);
  assert.ok(slices.length < turns.length);
  assert.equal(
    slices.reduce((sum, row) => sum + row.tokens, 0),
    turns.reduce((sum, row) => sum + row.tokens, 0),
  );
  const fromSlices = effortByPlan(slices);
  assert.equal(fromSlices[0]?.threads, 1);
  assert.equal(fromSlices[0]?.key, "CASA_READINESS_PLAN");
});

test("old named plans still attribute later turns after the display window", () => {
  const { planSlices } = rollupFromSources([
    source({
      sourceActivity: [
        {
          timestamp: "2020-01-01T10:00:00.000Z",
          role: "user",
          text: NAMED_PLAN,
        },
        {
          timestamp: "2026-08-14T10:00:00.000Z",
          role: "user",
          text: "continue",
        },
        {
          timestamp: "2026-08-14T10:01:00.000Z",
          role: "assistant",
          text: "On it.",
        },
      ],
    }),
  ]);
  const visible = filterSinceDay(planSlices, "2025-01-01");
  assert.ok(visible.some((row) => row.day.startsWith("2026-08-14")));
  assert.ok(visible.every((row) => row.planKey === "CASA_READINESS_PLAN"));
  assert.ok(!visible.some((row) => row.day.startsWith("2020")));
});
