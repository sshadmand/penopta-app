import assert from "node:assert/strict";
import test from "node:test";

import type { AgentThreadRow, SourceActivityItem } from "@/lib/db/schema";

import {
  buildDistillContext,
  isCorrectionTurn,
  threadsSinceWatermark,
} from "./distill-context";

function thread(
  id: string,
  syncedAt: string,
  activity: SourceActivityItem[] = [],
): AgentThreadRow {
  const at = new Date(syncedAt);
  return {
    id,
    orgId: "org",
    ownerUserId: "u1",
    threadId: id,
    title: `Thread ${id}`,
    kind: "chat",
    status: "done",
    threadCreatedAt: at,
    threadUpdatedAt: at,
    projectContext: null,
    sourceActivity: activity,
    workingState: null,
    lastAgentName: "claude",
    lastAgentModel: "m",
    lastAgentEffort: null,
    lastAgentId: "a",
    lastRunId: "r",
    lastSyncedAt: at,
    createdAt: at,
    updatedAt: at,
  };
}

const turn = (role: string, text: string): SourceActivityItem => ({
  timestamp: null,
  role,
  text,
  isExact: true,
});

test("isCorrectionTurn spots pushback, not plain asks", () => {
  assert.equal(isCorrectionTurn("No, use the raw body instead"), true);
  assert.equal(isCorrectionTurn("Always run migrations first"), true);
  assert.equal(isCorrectionTurn("Don't touch the lockfile"), true);
  assert.equal(isCorrectionTurn("Add a settings page for keys"), false);
});

test("threadsSinceWatermark keeps newer threads, oldest first", () => {
  const rows = [
    thread("b", "2026-10-03T00:00:00Z"),
    thread("a", "2026-10-01T00:00:00Z"),
    thread("c", "2026-10-02T00:00:00Z"),
  ];
  const picked = threadsSinceWatermark(rows, new Date("2026-10-01T12:00:00Z"));
  assert.deepEqual(
    picked.map((t) => t.id),
    ["c", "b"],
  );
  assert.equal(threadsSinceWatermark(rows, null).length, 3);
});

test("buildDistillContext tags corrections and drops lead-up", () => {
  const ctx = buildDistillContext({
    projectName: "Hooks",
    threads: [
      thread("x", "2026-10-01T00:00:00Z", [
        turn("user", "Fix the webhook retry"),
        turn("assistant", "Looking at the handler…"),
        turn("assistant", "I re-serialized the JSON body."),
        turn("user", "No, never re-serialize; verify on the raw body."),
        turn("assistant", "Switched to the raw body."),
      ]),
    ],
  });
  assert.equal(ctx.threadCount, 1);
  assert.equal(ctx.threadRefs.get("T1")?.id, "x");
  assert.ok(ctx.text.includes("[correction]: No, never re-serialize"));
  assert.ok(ctx.text.includes("I re-serialized the JSON body."));
  assert.ok(!ctx.text.includes("Looking at the handler"));
  assert.equal(ctx.includedThrough?.toISOString(), "2026-10-01T00:00:00.000Z");
});
