import assert from "node:assert/strict";
import test from "node:test";

import {
  fillMissingTimestamps,
  utcDayHour,
} from "./timestamps";

test("carries forward 1s so blank assistant turns stay distinct", () => {
  const filled = fillMissingTimestamps(
    ["2026-08-14T02:04:00.000Z", null, null, "2026-08-14T02:14:00.000Z"],
    null,
  );
  assert.equal(filled[0], "2026-08-14T02:04:00.000Z");
  assert.equal(filled[1], "2026-08-14T02:04:01.000Z");
  assert.equal(filled[2], "2026-08-14T02:04:02.000Z");
  assert.equal(filled[3], "2026-08-14T02:14:00.000Z");
});

test("backfills leading blanks from the next known stamp", () => {
  const filled = fillMissingTimestamps(
    [null, null, "2026-08-14T10:00:00.000Z"],
    null,
  );
  assert.equal(filled[0], "2026-08-14T09:59:58.000Z");
  assert.equal(filled[1], "2026-08-14T09:59:59.000Z");
  assert.equal(filled[2], "2026-08-14T10:00:00.000Z");
});

test("uses thread fallback when nothing is stamped", () => {
  const filled = fillMissingTimestamps(
    [null, null],
    "2026-08-14T17:00:00.000Z",
  );
  assert.equal(filled[0], "2026-08-14T17:00:00.000Z");
  assert.equal(filled[1], "2026-08-14T17:00:01.000Z");
});

test("utcDayHour buckets in UTC", () => {
  const bucket = utcDayHour("2026-08-14T02:04:00.000Z");
  assert.deepEqual(bucket, { day: "2026-08-14", hour: 2 });
});
