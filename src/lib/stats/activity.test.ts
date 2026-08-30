import assert from "node:assert/strict";
import test from "node:test";

import {
  activityPreviewDays,
  heatmapDisplayRows,
  localDaysEndingOn,
  mergeActivityBuckets,
  todayInTimeZone,
  utcDayHourInTimeZone,
} from "./activity";

test("heatmapDisplayRows for 6m is the recent half of the year grid", () => {
  const rows = heatmapDisplayRows("2026-08-19", "6m");
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.length, 27);
});

test("heatmapDisplayRows for 1y stacks two bands", () => {
  const rows = heatmapDisplayRows("2026-08-19", "1y");
  assert.equal(rows.length, 2);
  assert.equal((rows[0]?.length ?? 0) + (rows[1]?.length ?? 0), 53);
});

test("utcDayHourInTimeZone is identity in UTC", () => {
  assert.deepEqual(utcDayHourInTimeZone("2026-08-14", 2, "UTC"), {
    day: "2026-08-14",
    hour: 2,
  });
});

test("utcDayHourInTimeZone shifts into America/Los_Angeles", () => {
  assert.deepEqual(
    utcDayHourInTimeZone("2026-08-14", 2, "America/Los_Angeles"),
    { day: "2026-08-13", hour: 19 },
  );
});

test("todayInTimeZone uses the IANA calendar date", () => {
  const now = new Date("2026-08-14T02:00:00.000Z");
  assert.equal(todayInTimeZone("UTC", now), "2026-08-14");
  assert.equal(todayInTimeZone("America/Los_Angeles", now), "2026-08-13");
});

test("localDaysEndingOn returns oldest-first consecutive days", () => {
  assert.deepEqual(localDaysEndingOn("2026-08-14", 5), [
    "2026-08-10",
    "2026-08-11",
    "2026-08-12",
    "2026-08-13",
    "2026-08-14",
  ]);
});

test("mergeActivityBuckets sums the same UTC hour", () => {
  const merged = mergeActivityBuckets([
    { day: "2026-08-14", hour: 2, value: 1 },
    { day: "2026-08-14", hour: 2, value: 3 },
    { day: "2026-08-14", hour: 3, value: 1 },
  ]);
  merged.sort((a, b) => a.hour - b.hour);
  assert.deepEqual(merged, [
    { day: "2026-08-14", hour: 2, value: 4 },
    { day: "2026-08-14", hour: 3, value: 1 },
  ]);
});

test("activityPreviewDays fills five trailing days and colors by intensity", () => {
  const values = new Map([
    ["2026-08-10", 1],
    ["2026-08-12", 10],
    ["2026-08-14", 50],
  ]);
  const days = activityPreviewDays(values, "2026-08-14", 5);
  assert.equal(days.length, 5);
  assert.deepEqual(
    days.map((day) => day.day),
    ["2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14"],
  );
  assert.equal(days[1]?.value, 0);
  assert.equal(days[1]?.level, 0);
  assert.ok((days[0]?.level ?? 0) >= 1);
  assert.ok((days[4]?.level ?? 0) > (days[0]?.level ?? 0));
});
