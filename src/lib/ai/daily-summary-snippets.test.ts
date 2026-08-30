import assert from "node:assert/strict";
import test from "node:test";

import { DAILY_SUMMARY_META_START } from "@/lib/projects/chat-meta";

import {
  dayKeyFromDailySummary,
  formatDailySummariesForPrompt,
  snippetsFromDailySummaryPosts,
} from "./daily-summary-snippets";

test("dayKeyFromDailySummary prefers the stamped cron day", () => {
  assert.equal(
    dayKeyFromDailySummary(
      `${DAILY_SUMMARY_META_START}2026-08-17 · last 24h`,
      new Date("2026-08-18T06:00:00Z"),
    ),
    "2026-08-17",
  );
});

test("dayKeyFromDailySummary falls back to the UTC created date", () => {
  assert.equal(
    dayKeyFromDailySummary(null, new Date("2026-08-19T06:00:00Z")),
    "2026-08-19",
  );
});

test("formatDailySummariesForPrompt lists days in order and drops blanks", () => {
  const snippets = snippetsFromDailySummaryPosts([
    {
      text: "  ",
      meta: `${DAILY_SUMMARY_META_START}2026-08-16`,
      createdAt: new Date("2026-08-16T06:00:00Z"),
    },
    {
      text: "Shipped login.",
      meta: `${DAILY_SUMMARY_META_START}2026-08-17`,
      createdAt: new Date("2026-08-17T06:00:00Z"),
    },
    {
      text: "Fixed billing.",
      meta: `${DAILY_SUMMARY_META_START}2026-08-18`,
      createdAt: new Date("2026-08-18T06:00:00Z"),
    },
  ]);
  const { text, truncated } = formatDailySummariesForPrompt("Website", snippets);
  assert.equal(truncated, false);
  assert.match(text, /Workgroup "Website"/);
  assert.match(text, /\[2026-08-17\]\nShipped login\./);
  assert.match(text, /\[2026-08-18\]\nFixed billing\./);
  assert.doesNotMatch(text, /2026-08-16/);
});
